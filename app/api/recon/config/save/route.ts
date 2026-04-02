// app/api/recon/config/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ProposedStatementConfig } from '@/lib/types/statement'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
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
          trained_by: user.email,
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
