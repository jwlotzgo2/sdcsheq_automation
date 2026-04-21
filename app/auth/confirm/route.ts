import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Modern Supabase email confirmation endpoint — token-hash flow.
 *
 * This is the recommended replacement for the legacy
 * `…/auth/v1/verify?token=…&type=…&redirect_to=/api/auth/callback` pattern,
 * which has two UX problems:
 *   1. Supabase's /verify burns the token on GET, so any email-client prefetch
 *      (Outlook SafeLinks, Defender, Gmail image proxy) consumes it before the
 *      user clicks → user sees "Email link is invalid or has expired".
 *   2. The server-side verify + redirect hop adds latency.
 *
 * With this route the email contains a link directly to our app carrying
 * `?token_hash=…&type=invite|recovery|magiclink|email`. We verify it server-side
 * via `verifyOtp`, establish the session, then redirect to `next`.
 *
 * To enable this, update the Supabase Dashboard email templates so each link
 * looks like:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .EmailOtpType }}&next=/reset-password
 *
 * Idempotency: if a session is already present we short-circuit to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
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

  // Already signed in? Just redirect — don't burn the token.
  const { data: existing } = await supabase.auth.getUser()
  if (existing?.user) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Token may have been consumed by a mail-scanner prefetch; a session could
    // already exist on this cookie jar by now.
    const { data: afterAttempt } = await supabase.auth.getUser()
    if (afterAttempt?.user) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[auth/confirm] verifyOtp failed:', error.message)

    const target = new URL(`${origin}/login`)
    target.searchParams.set('error', 'link_expired')
    if (next) target.searchParams.set('next', next)
    return NextResponse.redirect(target)
  }

  // Implicit-flow fallback: Supabase's default `{{ .ConfirmationURL }}`
  // email template routes through /auth/v1/verify which 303-redirects here
  // with the tokens in a URL *hash fragment* (#access_token=…&type=…).
  // The browser never sends the hash to the server, so we can't see it here —
  // but it survives HTTP redirects. Bounce to `next` and let the client-side
  // page (e.g. /reset-password) pick up the hash via supabase-js.
  // This keeps the flow working regardless of whether the dashboard email
  // template has been switched to `{{ .TokenHash }}` yet.
  return NextResponse.redirect(`${origin}${next}`)
}
