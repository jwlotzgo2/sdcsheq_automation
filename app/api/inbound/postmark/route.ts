import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
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
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = body.MessageID ?? `unknown-${Date.now()}`
  const sender    = body.From ?? ''
  const subject   = body.Subject ?? ''
  const attachments: any[] = body.Attachments ?? []

  console.log(`[inbound] From: ${sender} | Attachments: ${attachments.length}`)

  await supabase.from('email_ingestion_log').insert({
    postmark_message_id: messageId,
    received_at: new Date().toISOString(),
    sender, subject,
    attachment_count: attachments.length,
    processed: false,
  })

  const pdfs = attachments.filter((a: any) =>
    a.ContentType === 'application/pdf' ||
    (a.Name && a.Name.toLowerCase().endsWith('.pdf')) ||
    (a.Name && a.Name.toLowerCase().endsWith('.PDF'))
  )

  if (pdfs.length === 0) {
    await supabase.from('email_ingestion_log')
      .update({ processed: true, error: 'No PDF attachments' })
      .eq('postmark_message_id', messageId)
    return NextResponse.json({ received: true, invoices_created: 0 })
  }

  const created: string[] = []
  const duplicates: string[] = []

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
        // Log to duplicate_log
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

      console.log(`[inbound] ✓ Invoice created: ${invoice.id} — triggering extraction`)
      created.push(invoice.id)

      // Trigger OCR extraction in background
      const { extractInvoice } = await import('@/lib/claude/extract')
      extractInvoice(invoice.id).catch(err => {
        console.error(`[inbound] Extraction error for ${invoice.id}:`, err.message)
      })

    } catch (err: any) {
      console.error('[inbound] Error:', err.message)
    }
  }

  await supabase.from('email_ingestion_log')
    .update({ processed: true })
    .eq('postmark_message_id', messageId)

  return NextResponse.json({
    received: true,
    invoices_created: created.length,
    duplicates_detected: duplicates.length,
    invoice_ids: created,
    duplicate_ids: duplicates,
  })
}
