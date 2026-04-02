import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: { statementId: string } }
) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch {}
          })
        },
      },
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { statementId } = params
  const supabase = getSupabase()

  try {
    const body = await req.json()
    const { statement_line_id, xero_transaction_id, xero_reference, xero_amount } = body as {
      statement_line_id: string
      xero_transaction_id: string
      xero_reference: string | null
      xero_amount: number
    }

    if (!statement_line_id || !xero_transaction_id) {
      return NextResponse.json({ error: 'statement_line_id and xero_transaction_id required' }, { status: 400 })
    }

    const { data: line } = await supabase
      .from('statement_lines')
      .select('id, debit_amount, credit_amount, line_type')
      .eq('id', statement_line_id)
      .eq('statement_id', statementId)
      .single()

    if (!line) {
      return NextResponse.json({ error: 'Statement line not found' }, { status: 404 })
    }

    const lineAmt = (line.line_type === 'PAYMENT' || line.line_type === 'CREDIT_NOTE')
      ? (line.credit_amount ?? 0)
      : (line.debit_amount ?? 0)
    const variance = Math.round((lineAmt - xero_amount) * 100) / 100

    await supabase
      .from('recon_matches')
      .upsert({
        statement_line_id,
        xero_transaction_id,
        xero_reference,
        xero_date: null,
        xero_amount,
        match_type: 'MANUAL',
        match_confidence: 1.0,
        variance_amount: variance,
        confirmed_by: user.email,
        confirmed_at: new Date().toISOString(),
        matched_at: new Date().toISOString(),
      }, { onConflict: 'statement_line_id' })

    await supabase
      .from('recon_exceptions')
      .delete()
      .eq('statement_line_id', statement_line_id)
      .eq('statement_id', statementId)

    const { count } = await supabase
      .from('recon_exceptions')
      .select('id', { count: 'exact', head: true })
      .eq('statement_id', statementId)
      .is('resolved_at', null)

    if (count === 0) {
      await supabase
        .from('supplier_statements')
        .update({ status: 'RECONCILED', reconciled_at: new Date().toISOString() })
        .eq('id', statementId)
    }

    return NextResponse.json({ success: true, variance })
  } catch (err) {
    console.error('[manual-match] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
