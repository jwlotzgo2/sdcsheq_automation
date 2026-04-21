import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  // Verify webhook token via query parameter
  // Postmark inbound webhooks don't support HMAC signatures,
  // so we use a secret token in the webhook URL: /api/inbound/postmark?token=xxx
  const webhookToken = process.env.POSTMARK_WEBHOOK_TOKEN
  if (!webhookToken) {
    console.error('[inbound] POSTMARK_WEBHOOK_TOKEN not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const urlToken = request.nextUrl.searchParams.get('token') ?? ''
  const tokenBuf = Buffer.from(urlToken)
  const expectedBuf = Buffer.from(webhookToken)
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    body = await request.json()
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

  // Trigger extraction inline BEFORE responding to Postmark.
  // Previously this was a fire-and-forget fetch; on Vercel Fluid Compute the
  // runtime can terminate after the response flush and cut the in-flight TCP
  // connection — which is how invoice 9951ee36 ended up stuck at INGESTED on
  // 2026-04-21 despite the webhook reporting success. Awaiting the extraction
  // call in-process guarantees it either completes or logs a concrete error.
  //
  // Postmark's inbound webhook tolerates up to ~10s response latency; each
  // invoice's extraction currently takes ~3-5s (Claude vision on a single
  // PDF), so we issue them in parallel and cap the overall wait.
  if (extractionQueue.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const triggers = extractionQueue.map((invoiceId) =>
      fetch(`${baseUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            console.error(`[inbound] Extraction HTTP ${res.status} for ${invoiceId}: ${text.slice(0, 200)}`)
          } else {
            console.log(`[inbound] ✓ Extraction triggered for ${invoiceId}`)
          }
        })
        .catch((err) => console.error(`[inbound] Extraction trigger failed for ${invoiceId}:`, err.message)),
    )

    // Best-effort: cap at 25s total so we stay well under Postmark's timeout.
    // If extraction is still running past the cap we fall through — the
    // invoice stays at INGESTED and the admin stuck-invoices page can
    // re-trigger it manually. This is strictly better than fire-and-forget.
    await Promise.race([
      Promise.allSettled(triggers),
      new Promise((resolve) => setTimeout(resolve, 25_000)),
    ])
  }

  return NextResponse.json({
    received: true,
    invoices_created: created.length,
    duplicates_detected: duplicates.length,
  })
}
