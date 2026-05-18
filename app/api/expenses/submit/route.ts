import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Mobile expense capture writes to invoices, invoice_line_items and
// audit_trail — and post-migration 006 only invoices_update/select have
// RLS policies for authenticated, while audit_trail has none. So browser
// inserts fail silently against RLS.
//
// This route gates on the user's user_profiles.can_capture_expenses
// flag (same gate the /capture page renders against) and then uses the
// service role to do the three inserts in sequence. Same shape as
// /api/invoices/[id]/transition.

type Body = {
  vendor_name: string
  receipt_date?: string | null
  amount_excl?: number | null
  amount_vat?: number | null
  amount_incl: number
  gl_code_id?: string | null
  cost_centre_id?: string | null
  client_name?: string | null
  notes?: string | null
  storage_path: string
}

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Auth + capture-permission gate ──
  const cookieStore = cookies()
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* read-only in handlers */ },
      },
    },
  )

  const { data: { user } } = await ssr.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await ssr
    .from('user_profiles')
    .select('can_capture_expenses, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.is_active || !profile.can_capture_expenses) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Validation ──
  const vendor = body.vendor_name?.trim()
  if (!vendor || !body.amount_incl || !body.storage_path) {
    return NextResponse.json(
      { error: 'vendor_name, amount_incl and storage_path are required' },
      { status: 400 },
    )
  }

  // ── Service-role inserts ──
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .insert({
      record_type:    'EXPENSE',
      source:         'MOBILE_CAPTURE',
      status:         'PENDING_REVIEW',
      supplier_name:  vendor,
      invoice_date:   body.receipt_date || new Date().toISOString().split('T')[0],
      amount_excl:    body.amount_excl,
      amount_vat:     body.amount_vat,
      amount_incl:    body.amount_incl,
      submitted_by:   user.email,
      cost_centre_id: body.cost_centre_id ?? null,
      client_name:    body.client_name ?? null,
      notes:          body.notes ?? null,
      storage_path:   body.storage_path,
      currency:       'ZAR',
    })
    .select('id')
    .single()

  if (invErr || !invoice) {
    console.error('[expense-submit] invoices insert failed:', invErr)
    return NextResponse.json(
      { error: invErr?.message || 'Failed to save expense' },
      { status: 500 },
    )
  }

  if (body.gl_code_id) {
    const { error: lineErr } = await admin.from('invoice_line_items').insert({
      invoice_id:  invoice.id,
      description: body.notes || vendor,
      line_total:  body.amount_excl ?? body.amount_incl,
      vat_rate:    body.amount_vat ? 15 : 0,
      gl_code_id:  body.gl_code_id,
      sort_order:  0,
    })
    if (lineErr) console.error('[expense-submit] line item insert failed:', lineErr)
  }

  const { error: auditErr } = await admin.from('audit_trail').insert({
    invoice_id:  invoice.id,
    from_status: null,
    to_status:   'PENDING_REVIEW',
    actor_email: user.email,
    notes:       `Expense submitted by ${user.email}`,
  })
  if (auditErr) console.error('[expense-submit] audit insert failed:', auditErr)

  return NextResponse.json({ id: invoice.id })
}
