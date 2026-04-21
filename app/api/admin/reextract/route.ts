import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/require-role'

/**
 * Admin-only rescue endpoint. Re-triggers extraction for an invoice that was
 * left at status=INGESTED because the original fire-and-forget fetch from the
 * Postmark webhook was truncated by the Vercel runtime (see commit message
 * for the 2026-04-21 incident). Delegates to the existing /api/extract route
 * using the same INTERNAL_API_KEY path so all the retry / status update /
 * audit trail behaviour is shared in one place.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  let body: { invoice_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const invoiceId = body.invoice_id
  if (!invoiceId || typeof invoiceId !== 'string') {
    return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const res = await fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
    body: JSON.stringify({ invoice_id: invoiceId }),
  })

  const text = await res.text()
  let payload: unknown
  try { payload = JSON.parse(text) } catch { payload = { raw: text } }

  console.log(`[admin/reextract] ${gate.user.email} -> ${invoiceId} (${res.status})`)

  if (!res.ok) {
    return NextResponse.json({ error: 'Extraction failed', detail: payload }, { status: res.status })
  }
  return NextResponse.json({ success: true, detail: payload })
}
