import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

type Patch = {
  role?: 'AP_CLERK' | 'REVIEWER' | 'APPROVER' | 'FINANCE_MANAGER' | 'AP_ADMIN'
  is_active?: boolean
  can_capture_expenses?: boolean
  supplier_id?: string | null
}

const ALLOWED_KEYS: (keyof Patch)[] = ['role', 'is_active', 'can_capture_expenses', 'supplier_id']

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  let body: Patch
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Whitelist-filter the incoming patch — ignore any unknown keys.
  const patch: Patch = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) (patch as any)[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('user_id', params.userId)

  if (error) {
    console.error('[admin/users/update]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[admin/users/update] ${gate.user.email} patched ${params.userId}: ${Object.keys(patch).join(',')}`)
  return NextResponse.json({ success: true })
}
