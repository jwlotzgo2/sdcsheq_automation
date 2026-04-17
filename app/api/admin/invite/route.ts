import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  const { email, role, update_existing } = await request.json()
  if (!email || !role) {
    return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    // Silent promotion is a privilege-escalation footgun. Require explicit opt-in.
    if (!update_existing) {
      return NextResponse.json(
        { error: 'User already exists. Resend with update_existing=true to change role.' },
        { status: 409 },
      )
    }
    await supabase.from('user_profiles').update({ role, is_active: true }).eq('email', email)
    console.log(`[invite] ${gate.user.email} updated ${email} -> ${role}`)
    return NextResponse.json({ success: true, message: 'User role updated' })
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
  })
  if (error) {
    console.error('[invite]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('user_profiles').upsert(
    { email, role, is_active: true },
    { onConflict: 'email', ignoreDuplicates: false },
  )

  console.log(`[invite] ${gate.user.email} invited ${email} as ${role}`)
  return NextResponse.json({ success: true })
}
