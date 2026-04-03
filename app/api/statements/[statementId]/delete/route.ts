// app/api/statements/[statementId]/delete/route.ts
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

export async function DELETE(
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

  // Cascade deletes handle statement_lines, recon_matches, recon_exceptions
  const { error } = await supabase
    .from('supplier_statements')
    .delete()
    .eq('id', statementId)

  if (error) {
    console.error('[delete-statement] Error:', error)
    return NextResponse.json({ error: 'Failed to delete statement' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
