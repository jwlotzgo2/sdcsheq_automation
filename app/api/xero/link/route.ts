import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_CLERK')
  if (!gate.ok) return gate.response

  try {
    const { invoice_id, xero_match_id } = await request.json()

    if (!invoice_id || !xero_match_id) {
      return NextResponse.json({ error: 'invoice_id and xero_match_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Fetch the match record
    const { data: match, error: matchError } = await supabase
      .from('xero_invoice_matches')
      .select('*')
      .eq('id', xero_match_id)
      .eq('invoice_id', invoice_id)
      .single()

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 })
    }

    // Fetch current invoice status
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('id', invoice_id)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Mark the match as linked
    await supabase.from('xero_invoice_matches').update({
      linked: true,
      linked_by: gate.user.email,
      linked_at: new Date().toISOString(),
    }).eq('id', xero_match_id)

    // Update the invoice with the Xero bill reference and set status to XERO_POSTED
    await supabase.from('invoices').update({
      xero_bill_id: match.xero_invoice_id,
      xero_bill_number: match.xero_invoice_number,
      status: 'XERO_POSTED',
    }).eq('id', invoice_id)

    // Log audit trail
    await supabase.from('audit_trail').insert({
      invoice_id,
      from_status: invoice.status,
      to_status: 'XERO_POSTED',
      actor_email: gate.user.email,
      notes: `Linked to existing Xero bill: ${match.xero_invoice_number ?? match.xero_invoice_id} (${match.xero_contact_name}, ${match.xero_status})`,
    })

    console.log(`[xero/link] Invoice ${invoice_id} linked to Xero bill ${match.xero_invoice_id}`)

    return NextResponse.json({
      success: true,
      xero_bill_id: match.xero_invoice_id,
      xero_bill_number: match.xero_invoice_number,
    })
  } catch (err: any) {
    console.error('[xero/link]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
