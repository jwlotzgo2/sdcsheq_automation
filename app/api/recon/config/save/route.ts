// app/api/recon/config/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ProposedStatementConfig } from '@/lib/types/statement'
import { requireRole } from '@/lib/auth/require-role'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, 'AP_CLERK')
  if (!gate.ok) return gate.response

  try {
    const body = await req.json()
    const {
      supplier_id,
      sample_storage_path,
      config,
    } = body as {
      supplier_id: string
      sample_storage_path: string
      config: ProposedStatementConfig
    }

    if (!supplier_id || !sample_storage_path || !config) {
      return NextResponse.json({ error: 'supplier_id, sample_storage_path and config required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('supplier_statement_configs')
      .upsert(
        {
          supplier_id,
          trained_by: gate.user.email,
          trained_at: new Date().toISOString(),
          sample_storage_path,
          date_format: config.date_format,
          reference_column_hint: config.reference_column_hint,
          reference_pattern: config.reference_pattern,
          debit_label: config.debit_label,
          credit_label: config.credit_label,
          payment_identifier: config.payment_identifier,
          opening_balance_label: config.opening_balance_label,
          closing_balance_label: config.closing_balance_label,
          layout_notes: config.layout_notes,
          sample_lines: config.sample_lines,
          is_active: true,
        },
        { onConflict: 'supplier_id' }
      )
      .select('id')
      .single()

    if (error) {
      console.error('[save-config] Supabase error:', error)
      return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
    }

    return NextResponse.json({ config_id: data.id })
  } catch (err) {
    console.error('[save-config] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
