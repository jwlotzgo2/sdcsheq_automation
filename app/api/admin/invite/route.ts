import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const { email, role } = await request.json()

  if (!email || !role) {
    return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Check if user already exists
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    // Just update their role
    await supabase.from('user_profiles').update({ role, is_active: true }).eq('email', email)
    return NextResponse.json({ success: true, message: 'User role updated' })
  }

  // Send magic link invite
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/dashboard`,
  })

  if (error) {
    console.error('[invite]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Pre-set role on the profile (created by trigger on signup)
  // Upsert in case profile already created
  await supabase.from('user_profiles').upsert({
    email,
    role,
    is_active: true,
  }, { onConflict: 'email', ignoreDuplicates: false })

  console.log(`[invite] ✓ Invited ${email} as ${role}`)
  return NextResponse.json({ success: true })
}
