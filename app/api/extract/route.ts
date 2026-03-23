import { NextRequest, NextResponse } from 'next/server'
import { extractInvoice } from '@/lib/claude/extract'

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_id } = body
  if (!invoice_id) {
    return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
  }

  // Run extraction in background — don't await so webhook returns fast
  extractInvoice(invoice_id).catch(err => {
    console.error(`[extract-route] Unhandled error for ${invoice_id}:`, err.message)
  })

  return NextResponse.json({ started: true, invoice_id })
}
