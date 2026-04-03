// app/api/recon/[statementId]/run/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupplierTransactions } from '@/lib/xero/getSupplierTransactions'
import { reconcile } from '@/lib/recon/reconcile'

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
    // 1. Load statement with supplier
    const { data: statement, error: stmtErr } = await supabase
      .from('supplier_statements')
      .select('id, supplier_id, status, date_from, date_to, suppliers(xero_contact_id)')
      .eq('id', statementId)
      .single()

    if (stmtErr || !statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    }

    if (!['EXTRACTED', 'EXCEPTION'].includes(statement.status)) {
      return NextResponse.json(
        { error: `Cannot reconcile: status is ${statement.status}. Must be EXTRACTED or EXCEPTION.` },
        { status: 400 }
      )
    }

    const xeroContactId = (statement.suppliers as any)?.xero_contact_id
    if (!xeroContactId) {
      return NextResponse.json(
        { error: 'Supplier not linked to Xero. Sync suppliers first.' },
        { status: 400 }
      )
    }

    if (!statement.date_from || !statement.date_to) {
      return NextResponse.json(
        { error: 'Statement has no date range. Re-extract first.' },
        { status: 400 }
      )
    }

    // 4. Set status to RECONCILING
    await supabase
      .from('supplier_statements')
      .update({ status: 'RECONCILING' })
      .eq('id', statementId)

    // 5. Load statement lines
    const { data: lines, error: linesErr } = await supabase
      .from('statement_lines')
      .select('id, reference, description, line_date, debit_amount, credit_amount, line_type')
      .eq('statement_id', statementId)
      .order('sort_order')

    if (linesErr || !lines) {
      await supabase.from('supplier_statements').update({ status: 'FAILED' }).eq('id', statementId)
      return NextResponse.json({ error: 'Failed to load statement lines' }, { status: 500 })
    }

    // 6. Fetch Xero transactions
    const xeroTxns = await getSupplierTransactions(
      xeroContactId,
      statement.date_from,
      statement.date_to
    )

    console.log(`[recon-run] Statement ${statementId}: ${lines.length} lines, ${xeroTxns.length} Xero transactions`)

    // 7. Run reconciliation
    const { matches, exceptions } = reconcile(lines, xeroTxns, statementId)

    // 8. Clear previous results (for re-runs)
    const lineIds = lines.map(l => l.id)
    if (lineIds.length > 0) {
      await supabase
        .from('recon_matches')
        .delete()
        .in('statement_line_id', lineIds)
    }
    await supabase
      .from('recon_exceptions')
      .delete()
      .eq('statement_id', statementId)

    // 9. Insert new matches
    if (matches.length > 0) {
      const { error: matchErr } = await supabase
        .from('recon_matches')
        .insert(matches)
      if (matchErr) {
        console.error('[recon-run] Match insert error:', matchErr)
      }
    }

    // 10. Insert new exceptions
    if (exceptions.length > 0) {
      const { error: excErr } = await supabase
        .from('recon_exceptions')
        .insert(exceptions)
      if (excErr) {
        console.error('[recon-run] Exception insert error:', excErr)
      }
    }

    // 11. Determine final status
    const finalStatus = exceptions.length === 0 ? 'RECONCILED' : 'EXCEPTION'
    await supabase
      .from('supplier_statements')
      .update({
        status: finalStatus,
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', statementId)

    console.log(`[recon-run] Done. ${matches.length} matches, ${exceptions.length} exceptions. Status: ${finalStatus}`)

    return NextResponse.json({
      status: finalStatus,
      matchCount: matches.length,
      exceptionCount: exceptions.length,
      xeroTransactionCount: xeroTxns.length,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error(`[recon-run] Unexpected error: ${msg}`)
    console.error(`[recon-run] Stack: ${err?.stack || 'no stack'}`)
    await supabase
      .from('supplier_statements')
      .update({ status: 'FAILED' })
      .eq('id', statementId)
    return NextResponse.json({ error: `Reconciliation failed: ${msg}` }, { status: 500 })
  }
}
