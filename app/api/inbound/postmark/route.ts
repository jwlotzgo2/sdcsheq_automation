import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  // Verify Postmark webhook signature
  const webhookToken = process.env.POSTMARK_WEBHOOK_TOKEN
  if (!webhookToken) {
    console.error('[inbound] POSTMARK_WEBHOOK_TOKEN not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-postmark-signature') ?? ''

  const expectedSignature = crypto
    .createHmac('sha256', webhookToken)
    .update(rawBody)
    .digest('base64')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = body.MessageID ?? `unknown-${Date.now()}`
  const sender    = body.From ?? ''
  const subject   = body.Subject ?? ''
  const attachments: any[] = body.Attachments ?? []

  console.log(`[inbound] From: ${sender} | Subject: ${subject} | Attachments: ${attachments.length}`)

  await supabase.from('email_ingestion_log').insert({
    postmark_message_id: messageId,
    received_at: new Date().toISOString(),
    sender, subject,
    attachment_count: attachments.length,
    processed: false,
  })

  const pdfs = attachments.filter((a: any) =>
    a.ContentType === 'application/pdf' ||
    (a.Name && a.Name.toLowerCase().endsWith('.pdf'))
  )

  if (pdfs.length === 0) {
    await supabase.from('email_ingestion_log')
      .update({ processed: true, error: 'No PDF attachments' })
      .eq('postmark_message_id', messageId)
    return NextResponse.json({ received: true, invoices_created: 0 })
  }

  const created: string[] = []
  const duplicates: string[] = []
  const extractionQueue: string[] = []

  for (const pdf of pdfs) {
    try {
      const buffer   = Buffer.from(pdf.Content, 'base64')
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

      // Duplicate check
      const { data: existing } = await supabase
        .from('invoices').select('id, invoice_number, supplier_name, amount_incl')
        .eq('file_hash', fileHash).maybeSingle()

      if (existing) {
        console.log(`[inbound] Duplicate detected — matched invoice ${existing.id}`)
        await supabase.from('duplicate_log').insert({
          received_at: new Date().toISOString(),
          sender,
          subject,
          file_hash: fileHash,
          matched_invoice_id: existing.id,
          postmark_message_id: messageId,
        })
        duplicates.push(existing.id)
        continue
      }

      // Upload to storage
      const year      = new Date().getFullYear()
      const month     = String(new Date().getMonth() + 1).padStart(2, '0')
      const safeName  = (pdf.Name ?? 'invoice.pdf').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '')
      const storagePath = `${year}/${month}/${Date.now()}-${safeName}`
      const storageUrl  = `${supabaseUrl}/storage/v1/object/invoices/${storagePath}`

      const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'false',
        },
        body: buffer,
      })
      const uploadJson = await uploadRes.json().catch(() => ({}))
      const storageOk  = uploadRes.ok
      if (!storageOk) console.error('[inbound] Storage error:', uploadJson)

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          status: 'INGESTED',
          source: 'EMAIL',
          storage_path: storageOk ? `invoices/${storagePath}` : null,
          postmark_message_id: messageId,
          file_hash: fileHash,
          supplier_name: sender,
          notes: `Subject: ${subject}`,
        })
        .select('id').single()

      if (invoiceError) {
        console.error('[inbound] Invoice error:', invoiceError.message)
        continue
      }

      await supabase.from('audit_trail').insert({
        invoice_id: invoice.id,
        from_status: null,
        to_status: 'INGESTED',
        actor_email: 'system',
        notes: `Received from ${sender} via Postmark`,
      })

      console.log(`[inbound] ✓ Invoice created: ${invoice.id}`)
      created.push(invoice.id)
      extractionQueue.push(invoice.id)

    } catch (err: any) {
      console.error('[inbound] Error:', err.message)
    }
  }

  await supabase.from('email_ingestion_log')
    .update({ processed: true })
    .eq('postmark_message_id', messageId)

  // Trigger extraction AFTER responding to Postmark
  // Use fire-and-forget fetch to our own extraction endpoint
  for (const invoiceId of extractionQueue) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    fetch(`${baseUrl}/api/actions/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY || serviceRoleKey },
      body: JSON.stringify({ invoice_id: invoiceId }),
    }).catch(err => console.error(`[inbound] Extraction trigger failed for ${invoiceId}:`, err.message))
  }

  return NextResponse.json({
    received: true,
    invoices_created: created.length,
    duplicates_detected: duplicates.length,
  })
}
