import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

type UserRole = 'AP_CLERK' | 'APPROVER' | 'FINANCE_MANAGER' | 'AP_ADMIN'

// App-level role hierarchy. The Postgres enum and is_role() still carry
// the legacy 'REVIEWER' value (see migration 001), but it is no longer
// used at the app layer — its former privileges are collapsed into AP_CLERK.
// Users whose DB role is still 'REVIEWER' would fail the HIERARCHY check
// below and get 403, which is the intended fail-closed behaviour.
//
// APPROVER is elevated to FINANCE_MANAGER parity at the app layer: any
// requireRole('FINANCE_MANAGER') gate (Xero push/sync/create-supplier,
// statements, duplicates, admin nav) is satisfied by APPROVER as well.
const HIERARCHY: Record<UserRole, UserRole[]> = {
  AP_CLERK:        ['AP_CLERK', 'APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  APPROVER:        ['APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  FINANCE_MANAGER: ['APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  AP_ADMIN:        ['AP_ADMIN'],
}

export type RequireRoleOk = {
  ok: true
  user: { id: string; email: string }
  profile: { role: UserRole; email: string; is_active: boolean }
}
export type RequireRoleErr = { ok: false; response: NextResponse }

/**
 * Gate an App Router route handler by role.
 * Returns { ok: true, user, profile } or { ok: false, response }.
 * Callers MUST early-return response on failure.
 */
export async function requireRole(
  _request: NextRequest,
  minRole: UserRole,
): Promise<RequireRoleOk | RequireRoleErr> {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* read-only in handlers */ },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, email, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const allowed = HIERARCHY[minRole]
  if (!allowed.includes(profile.role as UserRole)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email },
    profile: profile as RequireRoleOk['profile'],
  }
}
