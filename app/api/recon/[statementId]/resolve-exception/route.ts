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
    const { exception_id, resolution } = body as {
      exception_id: string
      resolution: string
    }

    if (!exception_id || !resolution) {
      return NextResponse.json({ error: 'exception_id and resolution required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('recon_exceptions')
      .update({
        resolved_by: user.email,
        resolved_at: new Date().toISOString(),
        resolution,
      })
      .eq('id', exception_id)
      .eq('statement_id', statementId)

    if (error) {
      return NextResponse.json({ error: 'Failed to resolve exception' }, { status: 500 })
    }

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

    return NextResponse.json({ success: true, remainingExceptions: count })
  } catch (err) {
    console.error('[resolve-exception] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
