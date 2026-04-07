import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  // Verify caller via cookie-based auth
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('email', user.email).maybeSingle()
  if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch auth.users for last sign in
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 100 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = users.map(u => ({
    id:            u.id,
    email:         u.email,
    last_sign_in:  u.last_sign_in_at,
    created_at:    u.created_at,
  }))

  return NextResponse.json({ users: result })
}
