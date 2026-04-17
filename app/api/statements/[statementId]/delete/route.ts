// app/api/statements/[statementId]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

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
  const gate = await requireRole(req, 'REVIEWER')
  if (!gate.ok) return gate.response

  const { statementId } = params
  const supabase = getSupabase()

  // Confirm the statement exists (returns 404 if not; avoids enumeration)
  const { data: statement } = await supabase
    .from('supplier_statements')
    .select('id')
    .eq('id', statementId)
    .maybeSingle()
  if (!statement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
