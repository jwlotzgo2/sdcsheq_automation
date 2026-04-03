// app/api/statements/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractStatement } from '@/lib/claude/extractStatement'

// Allow up to 60s for Claude PDF extraction
export const maxDuration = 60

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
    const { supplier_id, storage_path } = body as {
      supplier_id: string
      storage_path: string
    }

    if (!supplier_id || !storage_path) {
      return NextResponse.json(
        { error: 'supplier_id and storage_path required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    const { data: statement, error } = await supabase
      .from('supplier_statements')
      .insert({
        supplier_id,
        storage_path,
        status: 'INGESTED',
        ingested_by: user.email,
      })
      .select('id')
      .single()

    if (error || !statement) {
      return NextResponse.json({ error: 'Failed to create statement record' }, { status: 500 })
    }

    // Await extraction — must complete before serverless function exits
    try {
      await extractStatement(statement.id)
    } catch (extractErr) {
      console.error(`[ingest] Extraction error for ${statement.id}:`, extractErr)
      // Don't fail the response — the record exists with FAILED status
    }

    // Re-read status after extraction
    const { data: updated } = await supabase
      .from('supplier_statements')
      .select('status')
      .eq('id', statement.id)
      .single()

    return NextResponse.json({
      statement_id: statement.id,
      status: updated?.status || 'INGESTED',
    })
  } catch (err) {
    console.error('[ingest] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
