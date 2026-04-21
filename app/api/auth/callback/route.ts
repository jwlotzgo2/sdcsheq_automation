import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase PKCE callback.
 *
 * Called when an invite / recovery / magic-link email redirects back to the app
 * with `?code=...`. Also serves as a safe landing when the session has already
 * been established by a previous request (e.g. Outlook/SafeLinks prefetch).
 *
 * Idempotency:
 *  - If we already have a valid user session, just redirect to `next` — don't
 *    try to re-exchange (the code is single-use and would 400).
 *  - If exchange fails *and* a session exists, treat as success (prefetch case).
 *  - Only fall back to /login on a genuine failure.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // If a session already exists (e.g. email scanner/prefetch already consumed
  // the code), short-circuit to the destination. No 403 surfaced to the user.
  const { data: existing } = await supabase.auth.getUser()
  if (existing?.user) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Exchange failed. Re-check: if a session somehow materialised (race with
    // a prior callback invocation), treat as success.
    const { data: afterAttempt } = await supabase.auth.getUser()
    if (afterAttempt?.user) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  }

  // Genuine failure — push user to /login with a descriptive code so the UI
  // can offer a one-click "Send me a new link" action.
  const target = new URL(`${origin}/login`)
  target.searchParams.set('error', 'link_expired')
  if (next) target.searchParams.set('next', next)
  return NextResponse.redirect(target)
}
