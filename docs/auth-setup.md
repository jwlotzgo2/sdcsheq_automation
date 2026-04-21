# Auth setup — invite / login / password reset

This app uses Supabase Auth in **invite-only** mode: users are created by an
AP_ADMIN via `/admin/users`, which calls `/api/admin/invite`. Public sign-up is
not exposed in the UI.

## Runtime flow

1. **Invite** — admin POSTs email + role to `/api/admin/invite`. Server calls
   `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '<site>/auth/confirm?next=/reset-password' })`.
2. **User opens email** — link points to the Supabase-generated URL which, once
   the email template below is applied, targets `/auth/confirm?token_hash=…&type=invite&next=/reset-password`
   directly on our domain.
3. **`/auth/confirm` route** ([app/auth/confirm/route.ts](../app/auth/confirm/route.ts))
   calls `supabase.auth.verifyOtp({ type, token_hash })`, sets the session
   cookie, then redirects to `/reset-password`.
4. **`/reset-password`** detects the existing session (`getUser()` returns a
   user) and shows the "Set new password" form. `supabase.auth.updateUser({ password })`
   writes the initial password.
5. **Subsequent logins** use `/login` → `signInWithPassword`.

For password recovery the same path is used with `type=recovery`.

## Required Supabase Dashboard configuration

### 1. URL configuration (Auth → URL Configuration)

- **Site URL** — `https://<your-production-host>` (e.g. `https://sdcsheq-automation.vercel.app`).
- **Redirect URLs** (allow-list) must include:
  - `https://<host>/auth/confirm`
  - `https://<host>/api/auth/callback` (legacy fallback; still handled idempotently)
  - `https://<host>/reset-password`
  - plus any preview deploys, e.g. `https://*.vercel.app/**`

### 2. Email templates (Auth → Email Templates)

Replace the default `{{ .ConfirmationURL }}` links with token-hash links so the
user's click — not Supabase's `/verify` — is what consumes the OTP. This
prevents Outlook SafeLinks / Defender / Gmail image-proxy prefetch from burning
the token before the user arrives.

**Invite user**

```html
<h2>You're invited</h2>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">
    Accept invite and set your password
  </a>
</p>
```

**Reset password**

```html
<h2>Reset your password</h2>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
    Set a new password
  </a>
</p>
```

**Magic link** (if you enable it later)

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/">Sign in</a>
```

**Confirm signup** (only relevant if self-signup is ever enabled)

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/">Confirm email</a>
```

### 3. Rate limits (Auth → Rate Limits)

The default "Emails per hour" and the per-user anti-abuse cooldown (60 s) are
sensible. The login UI now renders a live countdown so users never see the
`429 over_email_send_rate_limit` error they hit previously — no need to raise
limits just for UX.

### 4. Required env vars (Vercel project settings)

- `NEXT_PUBLIC_SITE_URL` — must be set to the canonical site URL (e.g.
  `https://sdcsheq-automation.vercel.app`). Used as the `redirectTo` base when
  sending invites server-side.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

## Why this design

| Old behaviour | New behaviour |
|---|---|
| Supabase `/verify?token=…&redirect_to=/api/auth/callback` burned token on every GET — prefetched email scanners left the real user with a 403 "One-time token not found". | `/auth/confirm` verifies the token-hash server-side in our own route; we short-circuit when a session already exists, so scanner prefetches + user clicks are both safe. |
| `/api/auth/callback` was not in the middleware public-path list → unauthenticated GETs got `401 Unauthorized` JSON. | Both `/auth/confirm` and `/api/auth/callback` are public; callback is idempotent (checks for existing session before trying to exchange the code). |
| Login surface showed raw `Invalid login credentials` to newly-invited users who had never set a password. | Login detects `invalid_credentials` and offers an inline "Send me a reset link" CTA. |
| "Forgot password" button had no feedback — users clicked twice and saw `429 over_email_send_rate_limit`. | Button disables with a live `Resend in Ns` countdown. If Supabase still replies with a wait-N-seconds message, we parse it and seed the countdown. |
