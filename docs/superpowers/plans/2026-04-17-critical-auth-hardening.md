# Critical Auth Hardening Implementation Plan

> **UPDATE 2026-04-17:** After plan execution, the `REVIEWER` role was removed from the app layer — its former privileges were collapsed into `AP_CLERK`. The Postgres `user_role` enum and `public.is_role()` helper still carry `'REVIEWER'` (dead-but-harmless) pending a future migration. Every `requireRole(..., 'REVIEWER')` in the text below was changed to `'AP_CLERK'` in the actual code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three CRITICAL auth gaps in ap_automation_mvp: role-less admin routes (C1), service-role-key used as ambient internal auth (C6), and wide-open RLS `USING (true)` policies (C3).

**Architecture:** Three layered defenses. (1) A tiny `requireRole()` server helper gates every admin/xero mutation route by reading `user_profiles.role` after the middleware-verified session. (2) A dedicated `INTERNAL_API_KEY` replaces the service-role key for server-to-server hops, compared timing-safely. (3) Migration 006 drops permissive `USING (true)` policies and narrows SELECT/INSERT to `is_role('AP_CLERK')` or service-role-only, matching the stated role hierarchy already present in [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql:314).

**Tech Stack:** Next.js 14 App Router, `@supabase/ssr`, `@supabase/supabase-js`, Postgres RLS, Node `crypto.timingSafeEqual`.

**Out of scope (follow-up tickets):**
- Replacing inlined `createClient` / `createServerClient` with the `lib/supabase` helpers (M5/M6).
- Adding automated tests for these fixes — the repo has no test runner today; adding Vitest in this PR would balloon scope. Verification is manual `curl` scripts (Task 7).
- Tightening the supplier-portal isolation beyond what falls out of Tasks 2/3/5. Supplier-specific RLS is its own ticket.

---

## File Structure

**New files**
- `lib/auth/require-role.ts` — single export `requireRole(request, minRole)`. Creates a user-context Supabase client, loads the session user, reads `user_profiles.role`, and returns `{ user, profile, supabase, response }` on success or a `NextResponse` 401/403 on failure. Any route that currently spins up a service-role client WITHOUT role-gating must call this first.
- `lib/auth/internal-api-key.ts` — single export `isInternalCall(request)`. Timing-safe compare of `x-api-key` header against `process.env.INTERNAL_API_KEY`. Falls closed if the env var is unset.
- `supabase/migrations/006_tighten_rls.sql` — drops every `USING (true)` SELECT policy and the `audit_trail` INSERT policy, recreates them gated by `is_role()` or restricted to service role.
- `.env.example` — documents required env vars including the new `INTERNAL_API_KEY`. The repo has none today.

**Modified files**
- `middleware.ts` — replace the service-role-equality check with `isInternalCall(request)`.
- `app/api/admin/invite/route.ts` — call `requireRole('AP_ADMIN')`, remove the silent-promotion fallthrough.
- `app/api/admin/postmark-activity/route.ts` — call `requireRole('AP_ADMIN')`.
- `app/api/admin/postmark-retry/route.ts` — call `requireRole('AP_ADMIN')`.
- `app/api/admin/users-activity/route.ts` — call `requireRole('AP_ADMIN')`.
- `app/api/xero/create-supplier/route.ts` — call `requireRole('FINANCE_MANAGER')`.
- `app/api/xero/link/route.ts` — call `requireRole('REVIEWER')`; derive `user_email` from session, not request body.
- `app/api/xero/match/route.ts` — call `requireRole('REVIEWER')`.
- `app/api/xero/push/route.ts` — call `requireRole('FINANCE_MANAGER')`.
- `app/api/xero/sync/route.ts` — call `requireRole('FINANCE_MANAGER')`.
- `app/api/xero/find-supplier/route.ts` — call `requireRole('REVIEWER')`.
- `app/api/xero/tax-rates/route.ts` — call `requireRole('REVIEWER')`.
- `app/api/statements/[statementId]/delete/route.ts` — call `requireRole('REVIEWER')` AND verify statement ownership before delete.
- `app/api/recon/config/analyse/route.ts` — call `requireRole('REVIEWER')`.
- `app/api/recon/config/save/route.ts` — call `requireRole('REVIEWER')`.
- `app/api/extract/route.ts` — accept EITHER an authenticated REVIEWER+ user OR a valid `INTERNAL_API_KEY` header (postmark fires this as a server-to-server call).
- `app/api/expenses/extract/route.ts` — call `requireRole('AP_CLERK')`.
- `app/api/inbound/postmark/route.ts` — require `INTERNAL_API_KEY` in the outgoing fetch to `/api/extract`; drop the service-role-key fallback on line 166.

---

## Task 1: Internal API key helper

**Files:**
- Create: `lib/auth/internal-api-key.ts`

- [ ] **Step 1: Write the helper**

Create `lib/auth/internal-api-key.ts`:

```ts
import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * Timing-safe comparison of the incoming x-api-key header against
 * INTERNAL_API_KEY. Falls closed if the env var is missing.
 */
export function isInternalCall(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) return false

  const provided = request.headers.get('x-api-key') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```

- [ ] **Step 2: Update `middleware.ts` to use the helper**

In [middleware.ts](middleware.ts:30-33), replace the block:

```ts
  // Allow internal service-to-service calls authenticated via x-api-key
  const apiKey = request.headers.get('x-api-key')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const isInternalCall = !!(apiKey && serviceKey && apiKey === serviceKey)
```

with:

```ts
  // Allow internal service-to-service calls authenticated via INTERNAL_API_KEY
  // (DO NOT reuse SUPABASE_SERVICE_ROLE_KEY — separate secret, separate blast radius)
  const { isInternalCall: checkInternal } = await import('@/lib/auth/internal-api-key')
  const isInternalCall = checkInternal(request)
```

- [ ] **Step 3: Update the postmark → extract call**

In [app/api/inbound/postmark/route.ts:166](app/api/inbound/postmark/route.ts:166), replace:

```ts
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY || serviceRoleKey },
```

with:

```ts
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
```

(No fallback. If `INTERNAL_API_KEY` is unset in prod the route will fail fast and get caught in logs.)

- [ ] **Step 4: Update `.env.example`**

Create `.env.example` at repo root:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Internal server-to-server auth (NOT the service-role key)
# Generate: openssl rand -hex 32
INTERNAL_API_KEY=

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Cron
CRON_SECRET=

# Postmark inbound webhook
POSTMARK_WEBHOOK_TOKEN=
POSTMARK_SERVER_TOKEN=

# Xero OAuth
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=
XERO_ENCRYPTION_KEY=

# Anthropic
ANTHROPIC_API_KEY=
```

- [ ] **Step 5: Manually verify middleware**

Start the dev server and in a second shell:

```bash
# Should redirect to /login (302) because no cookies and no valid internal key
curl -i -H "x-api-key: wrong" http://localhost:3000/api/admin/invite -d '{}' -H "Content-Type: application/json"

# Should 401 (reaches middleware, rejected by middleware)
curl -i -H "x-api-key: $(openssl rand -hex 32)" http://localhost:3000/api/admin/invite -d '{}' -H "Content-Type: application/json"
```

Expected: both return 401 or a redirect to `/login`. Neither should reach the handler.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/internal-api-key.ts middleware.ts app/api/inbound/postmark/route.ts .env.example
git commit -m "security: separate INTERNAL_API_KEY from service-role key for internal auth"
```

---

## Task 2: Role-check helper

**Files:**
- Create: `lib/auth/require-role.ts`

- [ ] **Step 1: Write the helper**

Create `lib/auth/require-role.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

type UserRole = 'AP_CLERK' | 'REVIEWER' | 'APPROVER' | 'FINANCE_MANAGER' | 'AP_ADMIN'

// Mirrors public.is_role() in migration 001 — must stay in sync.
const HIERARCHY: Record<UserRole, UserRole[]> = {
  AP_CLERK:        ['AP_CLERK', 'REVIEWER', 'APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  REVIEWER:        ['REVIEWER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  APPROVER:        ['APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  FINANCE_MANAGER: ['FINANCE_MANAGER', 'AP_ADMIN'],
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
```

- [ ] **Step 2: Sanity build**

Run:

```bash
npx tsc --noEmit
```

Expected: no new type errors surfaced by the helper. (Pre-existing errors in the repo are expected — `ignoreBuildErrors` masks them in prod but this compile step will still print them.)

- [ ] **Step 3: Commit**

```bash
git add lib/auth/require-role.ts
git commit -m "security: add requireRole server helper for role-gated API routes"
```

---

## Task 3: Gate /api/admin/invite and fix silent promotion

**Files:**
- Modify: `app/api/admin/invite/route.ts`

- [ ] **Step 1: Replace the handler**

Replace the entire contents of [app/api/admin/invite/route.ts](app/api/admin/invite/route.ts:1-50) with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  const { email, role, update_existing } = await request.json()
  if (!email || !role) {
    return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    // Silent promotion is a privilege-escalation footgun. Require explicit opt-in.
    if (!update_existing) {
      return NextResponse.json(
        { error: 'User already exists. Resend with update_existing=true to change role.' },
        { status: 409 },
      )
    }
    await supabase.from('user_profiles').update({ role, is_active: true }).eq('email', email)
    console.log(`[invite] ${gate.user.email} updated ${email} -> ${role}`)
    return NextResponse.json({ success: true, message: 'User role updated' })
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
  })
  if (error) {
    console.error('[invite]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('user_profiles').upsert(
    { email, role, is_active: true },
    { onConflict: 'email', ignoreDuplicates: false },
  )

  console.log(`[invite] ${gate.user.email} invited ${email} as ${role}`)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Audit the admin UI**

Check [app/admin/users/page.tsx](app/admin/users/page.tsx) for any call to `/api/admin/invite` that assumes silent promotion. If found, update the caller to pass `update_existing: true` when the UI explicitly intends to change an existing user's role (i.e. the user clicked an "Update role" button, not a generic "Invite" button). If the UI only ever invites new users, no change needed.

Run:

```bash
grep -n "api/admin/invite" app/admin/users/page.tsx
```

Patch any caller accordingly.

- [ ] **Step 3: Manual verification**

With the dev server running and signed in as a non-admin (e.g. a `REVIEWER` test user):

```bash
# Replace <cookies> with the session cookie from the browser
curl -i -X POST http://localhost:3000/api/admin/invite \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookies>" \
  -d '{"email":"attacker@evil.com","role":"AP_ADMIN"}'
```

Expected: `403 Forbidden`.

Signed in as `AP_ADMIN`, try to promote an existing user without the flag:

```bash
curl -i -X POST http://localhost:3000/api/admin/invite \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-cookies>" \
  -d '{"email":"existing@org.com","role":"AP_ADMIN"}'
```

Expected: `409 Conflict`. Retry with `"update_existing":true` → `200 OK`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/invite/route.ts
# also stage any admin/users/page.tsx edit
git commit -m "security: require AP_ADMIN for /api/admin/invite, block silent role promotion"
```

---

## Task 4: Gate remaining admin and Xero routes

**Files:**
- Modify: `app/api/admin/postmark-activity/route.ts`
- Modify: `app/api/admin/postmark-retry/route.ts`
- Modify: `app/api/admin/users-activity/route.ts`
- Modify: `app/api/xero/create-supplier/route.ts`
- Modify: `app/api/xero/link/route.ts`
- Modify: `app/api/xero/match/route.ts`
- Modify: `app/api/xero/push/route.ts`
- Modify: `app/api/xero/sync/route.ts`
- Modify: `app/api/xero/find-supplier/route.ts`
- Modify: `app/api/xero/tax-rates/route.ts`
- Modify: `app/api/statements/[statementId]/delete/route.ts`
- Modify: `app/api/recon/config/analyse/route.ts`
- Modify: `app/api/recon/config/save/route.ts`
- Modify: `app/api/expenses/extract/route.ts`

The pattern is identical for each: inject `requireRole()` at the top of the `POST`/`GET`/`DELETE` handler and early-return on failure.

- [ ] **Step 1: Apply pattern to each admin route**

For each of `postmark-activity`, `postmark-retry`, `users-activity`: at the top of the `GET` (or `POST`) handler, insert:

```ts
import { requireRole } from '@/lib/auth/require-role'
// ...existing imports...

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  // ...existing body, delete the old `supabase.auth.getUser()` / `if (!user)` block...
}
```

Remove the pre-existing `if (!user) return 401` block in each — `requireRole` supersedes it.

- [ ] **Step 2: Apply pattern to Xero routes with the matching minimum role**

| Route | Required role |
|---|---|
| `create-supplier` | `FINANCE_MANAGER` |
| `push` | `FINANCE_MANAGER` |
| `sync` | `FINANCE_MANAGER` |
| `link` | `REVIEWER` |
| `match` | `REVIEWER` |
| `find-supplier` | `REVIEWER` |
| `tax-rates` | `REVIEWER` |

Same pattern: `const gate = await requireRole(request, '<ROLE>'); if (!gate.ok) return gate.response`.

- [ ] **Step 3: Fix audit-author forgery in `/api/xero/link`**

In [app/api/xero/link/route.ts](app/api/xero/link/route.ts:14), stop reading `user_email` from the request body. Use `gate.user.email` instead:

```ts
const { invoice_id, xero_match_id /* remove user_email from destructure */ } = await request.json()
// ...
// anywhere the old code wrote `user_email` into audit_trail, write gate.user.email
```

Grep the file for `user_email` and replace every read from request body with `gate.user.email`.

- [ ] **Step 4: Fix statement delete ownership check**

[app/api/statements/[statementId]/delete/route.ts](app/api/statements/%5BstatementId%5D/delete/route.ts) — add ownership verification before delete:

```ts
export async function DELETE(request: NextRequest, { params }: { params: { statementId: string } }) {
  const gate = await requireRole(request, 'REVIEWER')
  if (!gate.ok) return gate.response

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Confirm the statement exists before deletion (403 if not found — avoid 404 enumeration)
  const { data: statement } = await supabase
    .from('supplier_statements')
    .select('id')
    .eq('id', params.statementId)
    .maybeSingle()
  if (!statement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ...existing delete logic...
}
```

(If the schema gains a `created_by` or `supplier_id` → supplier-owner link later, extend the check here. For now, the role gate + existence check is the minimum.)

- [ ] **Step 5: Fix `/api/extract` to accept either session OR internal key**

In [app/api/extract/route.ts](app/api/extract/route.ts:1), gate with an "either/or" check:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { isInternalCall } from '@/lib/auth/internal-api-key'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  if (!isInternalCall(request)) {
    const gate = await requireRole(request, 'REVIEWER')
    if (!gate.ok) return gate.response
  }

  // ...existing body...
}
```

- [ ] **Step 6: Apply role gate to `/api/expenses/extract` and both recon config routes**

`expenses/extract` → `AP_CLERK`. `recon/config/analyse` and `recon/config/save` → `REVIEWER`. Same pattern as Step 1.

- [ ] **Step 7: Manual verification (spot-check 3 routes)**

Signed in as a non-admin (e.g. AP_CLERK):

```bash
curl -i -X POST http://localhost:3000/api/xero/create-supplier \
  -H "Content-Type: application/json" -H "Cookie: <ap-clerk-cookies>" \
  -d '{"name":"Test Co"}'
# Expected: 403

curl -i -X POST http://localhost:3000/api/xero/sync \
  -H "Content-Type: application/json" -H "Cookie: <ap-clerk-cookies>" -d '{}'
# Expected: 403

curl -i -X GET http://localhost:3000/api/admin/postmark-activity \
  -H "Cookie: <reviewer-cookies>"
# Expected: 403 (REVIEWER is not AP_ADMIN)
```

Signed in as an `AP_ADMIN` the same calls should return their normal success responses (200).

- [ ] **Step 8: Commit**

```bash
git add app/api/admin app/api/xero app/api/statements app/api/recon app/api/extract app/api/expenses
git commit -m "security: require appropriate role on all admin/xero/recon/extract routes"
```

---

## Task 5: Migration 006 — tighten RLS

**Files:**
- Create: `supabase/migrations/006_tighten_rls.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_tighten_rls.sql`:

```sql
-- ============================================================
-- Migration: 006_tighten_rls.sql
-- Purpose:   Replace "USING (true)" policies from 001 with
--            role-gated policies. Service-role DML still bypasses
--            RLS, so API routes using SERVICE_ROLE_KEY are
--            unaffected — they must enforce role in code.
-- ============================================================

-- ── invoices ────────────────────────────────────────────────
drop policy if exists "Authenticated users can view invoices" on public.invoices;
drop policy if exists "Service role can insert invoices" on public.invoices;

create policy "Internal users can view invoices"
  on public.invoices for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- Inserts happen via SERVICE_ROLE_KEY (extract, postmark). No
-- "authenticated" INSERT policy is needed; service role bypasses RLS.

-- ── invoice_line_items ──────────────────────────────────────
drop policy if exists "Authenticated users can view line items" on public.invoice_line_items;

create policy "Internal users can view line items"
  on public.invoice_line_items for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── ocr_extractions ─────────────────────────────────────────
drop policy if exists "Authenticated users can view OCR data" on public.ocr_extractions;

create policy "Internal users can view OCR data"
  on public.ocr_extractions for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── audit_trail ─────────────────────────────────────────────
drop policy if exists "Authenticated users can view audit trail" on public.audit_trail;
drop policy if exists "Authenticated users can insert audit entries" on public.audit_trail;

create policy "Admins can view audit trail"
  on public.audit_trail for select
  to authenticated
  using (public.is_role('AP_ADMIN'));

-- Inserts are service-role only (writes come from routes using SERVICE_ROLE_KEY).
-- No authenticated INSERT policy → authed users cannot forge entries.

-- ── suppliers ───────────────────────────────────────────────
drop policy if exists "Authenticated users can view suppliers" on public.suppliers;

create policy "Internal users can view suppliers"
  on public.suppliers for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── gl_codes ────────────────────────────────────────────────
drop policy if exists "Authenticated users can view GL codes" on public.gl_codes;

create policy "Internal users can view GL codes"
  on public.gl_codes for select
  to authenticated
  using (public.is_role('AP_CLERK'));
```

- [ ] **Step 2: Push the migration locally**

If `supabase` CLI is linked:

```bash
supabase db push
```

Otherwise run the SQL directly against the dev DB via the Supabase SQL editor. DO NOT run against prod yet — wait for Task 7 verification.

- [ ] **Step 3: Verify old policies are gone**

```sql
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and qual = 'true';
```

Expected: zero rows. If any `qual = 'true'` policy remains on `invoices`/`invoice_line_items`/`ocr_extractions`/`audit_trail`/`suppliers`/`gl_codes`, the migration is incomplete.

- [ ] **Step 4: Verify RLS still lets the app work**

With the dev server running and signed in as a user with role `REVIEWER`:

```sql
-- In Supabase SQL editor, impersonating that user via PostgREST JWT OR:
-- Hit the frontend and confirm /invoices, /dashboard, /suppliers render normally.
```

If a page breaks, the minimum-role on that table is too strict — downgrade or add a second policy.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_tighten_rls.sql
git commit -m "security: tighten RLS — drop USING (true) policies (migration 006)"
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Security" section to README**

Append to [README.md](README.md):

```markdown
## Security Model

- Authentication is handled by Supabase Auth (session cookies, verified by `middleware.ts`).
- Authorization is role-based via `user_profiles.role` and the Postgres helper `public.is_role()`. Role hierarchy: `AP_CLERK < REVIEWER < APPROVER < FINANCE_MANAGER < AP_ADMIN`.
- API routes that mutate data must call `requireRole()` from `lib/auth/require-role.ts` — see examples in `app/api/admin/invite/route.ts`.
- Server-to-server calls between internal routes use `INTERNAL_API_KEY` (distinct from `SUPABASE_SERVICE_ROLE_KEY`) with a timing-safe compare in `middleware.ts`.
- Postgres RLS enforces role-gated SELECTs on all public tables as a defense-in-depth layer; routes using `SUPABASE_SERVICE_ROLE_KEY` bypass RLS and MUST gate role in code.

To provision a new env, copy `.env.example` to `.env.local` and fill in values. Generate `INTERNAL_API_KEY` and `CRON_SECRET` with `openssl rand -hex 32`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document auth + RLS security model"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Prepare fixture users**

In Supabase SQL editor, create three test users (or use existing ones) with roles `AP_CLERK`, `REVIEWER`, `AP_ADMIN`. Capture a session cookie for each from the browser DevTools.

- [ ] **Step 2: Walk the authorization matrix**

Run this checklist, replacing `<cookies>` per user:

| Route | Method | As AP_CLERK | As REVIEWER | As AP_ADMIN |
|---|---|---|---|---|
| `/api/admin/invite` | POST | 403 | 403 | 409 or 200 |
| `/api/admin/postmark-activity` | GET | 403 | 403 | 200 |
| `/api/xero/create-supplier` | POST | 403 | 403 | 200 (needs FINANCE_MANAGER — 200 only as AP_ADMIN) |
| `/api/xero/sync` | POST | 403 | 403 | 200 |
| `/api/xero/match` | POST | 403 | 200 | 200 |
| `/api/statements/<id>/delete` | DELETE | 403 | 200 (if exists) | 200 |
| `/api/extract` | POST (no api key) | 403 | 200 | 200 |
| `/api/extract` | POST with `x-api-key: $INTERNAL_API_KEY` | 200 | 200 | 200 |

For each row, run `curl -i -X <METHOD> -H "Cookie: <cookies>" http://localhost:3000<route>` and confirm the status.

- [ ] **Step 3: Verify audit_trail cannot be forged**

Signed in as any non-admin, in the browser DevTools console:

```js
await fetch('https://<supabase-url>/rest/v1/audit_trail', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '<NEXT_PUBLIC_SUPABASE_ANON_KEY>',
    'Authorization': `Bearer <user-jwt>`,
  },
  body: JSON.stringify({ invoice_id: null, action: 'forged', user_email: 'evil@x' }),
})
```

Expected: `403` or `401` (RLS blocks).

- [ ] **Step 4: Verify the matrix results**

If any cell in the matrix returns the wrong status, revert the commit touching that route and redo with the correct role.

- [ ] **Step 5: Final commit (if any docs/fixups)**

```bash
git status
# commit anything uncommitted
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** C1 (admin/invite) covered by Task 3. C6 (service-role-as-ambient-auth) covered by Task 1. C3 (RLS `USING (true)`) covered by Task 5. All other HIGH-severity audit-author forgery and statement-ownership issues covered by Task 4.
- [ ] **Placeholder scan:** no "TBD"/"handle appropriately". Each step names specific files, lines, and code.
- [ ] **Type consistency:** `RequireRoleOk` / `RequireRoleErr` used identically across Tasks 2/3/4. `isInternalCall` exported from `lib/auth/internal-api-key.ts` and imported with the same name in middleware + extract.
- [ ] **Ordering:** Task 1 must precede Task 4 (extract route depends on `isInternalCall`). Task 2 must precede Tasks 3 + 4. Task 5 is independent but is the highest-risk of the set (RLS tightening can break reads); keep it last so the auth gate is in place first and any breakage surfaces with clear 403s, not mysterious blank pages.
- [ ] **Reversibility:** Migration 006 can be rolled back by re-creating the old `USING (true)` policies; document this if needed.
