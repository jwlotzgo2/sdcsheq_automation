import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractInvoice } from '@/lib/claude/extract'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_id, reextract } = body
  if (!invoice_id) {
    return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
  }

  // If re-extracting, clear old line items and reset status
  if (reextract) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice_id)
    await supabase.from('invoices').update({ status: 'INGESTED' }).eq('id', invoice_id)
    console.log(`[extract-route] Re-extraction: cleared line items for ${invoice_id}`)
  }

  // Run extraction — await it so we can report success/failure
  try {
    await extractInvoice(invoice_id)
    return NextResponse.json({ success: true, invoice_id })
  } catch (err: any) {
    console.error(`[extract-route] Error for ${invoice_id}:`, err.message)
    return NextResponse.json({ error: err.message, invoice_id }, { status: 500 })
  }
}
