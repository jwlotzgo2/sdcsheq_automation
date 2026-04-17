import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

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
