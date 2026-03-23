import { NextRequest, NextResponse } from 'next/server'
import { pushInvoiceToXero } from '@/lib/xero/client'

export async function POST(request: NextRequest) {
  try {
    const { invoice_id } = await request.json()
    if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

    const result = await pushInvoiceToXero(invoice_id)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[xero/push]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
