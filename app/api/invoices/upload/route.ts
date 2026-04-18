import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { requireRole } from '@/lib/auth/require-role'

export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_CLERK')
  if (!gate.ok) return gate.response

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

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

  // Duplicate check — return 409 with existing metadata so the UI can link to it
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number, supplier_name, created_at')
    .eq('file_hash', fileHash)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      {
        error: 'Duplicate',
        existing_id: existing.id,
        existing_invoice_number: existing.invoice_number,
        existing_supplier_name: existing.supplier_name,
        existing_created_at: existing.created_at,
      },
      { status: 409 },
    )
  }

  // Upload to Supabase Storage — raw fetch matches the postmark pattern
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const safeName = (file.name || 'invoice.pdf').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '')
  const storagePath = `manual/${year}/${month}/${Date.now()}-${safeName}`
  const storageUrl = `${supabaseUrl}/storage/v1/object/invoices/${storagePath}`

  const uploadRes = await fetch(storageUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false',
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    const detail = await uploadRes.json().catch(() => ({}))
    console.error('[invoice-upload] Storage error:', detail)
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
  }

  // Insert invoice row
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      status: 'INGESTED',
      source: 'MANUAL_UPLOAD',
      storage_path: `invoices/${storagePath}`,
      file_hash: fileHash,
      notes: `Uploaded manually by ${gate.user.email} · original: ${file.name}`,
    })
    .select('id')
    .single()

  if (invoiceError) {
    console.error('[invoice-upload] Insert error:', invoiceError.message)
    return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  }

  // Audit trail entry (service-role INSERT bypasses RLS)
  await supabase.from('audit_trail').insert({
    invoice_id: invoice.id,
    from_status: null,
    to_status: 'INGESTED',
    actor_email: gate.user.email,
    notes: `Manual upload · ${file.name}`,
  })

  // Fire-and-forget extraction trigger — same pattern as postmark line 164
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
    body: JSON.stringify({ invoice_id: invoice.id }),
  }).catch(err => console.error(`[invoice-upload] Extraction trigger failed for ${invoice.id}:`, err.message))

  console.log(`[invoice-upload] ✓ ${gate.user.email} uploaded ${file.name} -> ${invoice.id}`)
  return NextResponse.json({ invoice_id: invoice.id, status: 'INGESTED' })
}
