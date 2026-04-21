# send-email-v6

Supabase **Auth Send-Email Hook**. When Supabase Auth wants to send an email
(invite, reset, magic link, email change, signup confirm) and a Send-Email hook
is configured on the project, Supabase calls this function with the user info
and token data instead of rendering the dashboard template. That means the
dashboard template editor is bypassed for every outbound email — edits there
have no effect while this hook is active.

## Why it exists

We customise the email look-and-feel and — more importantly — **control the
link structure**. Each template now builds:

```
<SITE>/auth/confirm?next=<next>&token_hash=<hash>&type=<invite|recovery|...>
```

instead of the legacy `supabase.co/auth/v1/verify?token=…&redirect_to=…`
pattern. This routes the OTP verification through the app's own
`/auth/confirm` route (which is idempotent), protecting against Outlook
SafeLinks / Gmail image-proxy prefetch that would otherwise burn the one-time
token before the user clicks.

See `docs/auth-setup.md` for the full auth flow.

## Deploy

The hook is deployed via the Supabase Management API (or `supabase functions
deploy send-email-v6`). It is **not built or bundled by Vercel** — Vercel only
serves the Next.js app. Pushing to this branch does not redeploy the hook.

### Deploy via Supabase CLI

```bash
supabase functions deploy send-email-v6 \
  --project-ref clsrfusyvayntwuudtpz \
  --no-verify-jwt
```

### Required secrets (set once on Supabase)

- `RESEND_API_KEY` — Resend account API key used for outbound delivery
- `SUPABASE_URL` — auto-populated by Supabase; used as the legacy fallback base

### Hook registration

In Supabase Dashboard → **Authentication → Hooks** → **Send Email hook** — the
function URL is:

```
https://clsrfusyvayntwuudtpz.supabase.co/functions/v1/send-email-v6
```

Leave the hook secret field alone unless you rotate it. Without the hook
enabled, Supabase falls back to the dashboard email templates.

## Local dev

You can render a template offline by importing from `_templates/` in a small
Deno script. The `buildConfirmUrl` helper in `_layout.tsx` is the single
source of truth for link shape — tests / previews should use it rather than
rebuilding the URL.
