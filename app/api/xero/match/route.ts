import { NextRequest, NextResponse } from 'next/server'
import { checkAndStoreXeroMatches } from '@/lib/xero/findMatchingInvoice'

export async function POST(request: NextRequest) {
  try {
    const { invoice_id } = await request.json()
    if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

    const matchCount = await checkAndStoreXeroMatches(invoice_id)
    return NextResponse.json({ success: true, matches_found: matchCount })
  } catch (err: any) {
    console.error('[xero/match]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
