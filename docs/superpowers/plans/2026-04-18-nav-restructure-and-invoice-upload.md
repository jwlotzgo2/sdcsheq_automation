# Nav Restructure + Invoice Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar into six named sections (with 8 label renames) and add a new `/invoice-upload` page that routes manually-uploaded PDFs through the existing AI extraction pipeline.

**Architecture:** Two cohesive changes land together to avoid a broken nav link. (1) A new POST endpoint `/api/invoices/upload` mirrors the postmark ingest path — upload PDF to the `invoices` storage bucket, insert an invoice row with `source='MANUAL_UPLOAD'`, fire the internal extraction webhook. (2) A new client page at `/invoice-upload` drops PDFs into that endpoint via `react-dropzone`. (3) `AppShell.tsx` is restructured to render six role-gated sections in both the desktop sidebar and the mobile "More" drawer.

**Tech Stack:** Next.js 14 App Router, `@supabase/supabase-js` (service-role client), `react-dropzone` (already in `package.json`), existing `requireRole()` + `INTERNAL_API_KEY` helpers from the auth-hardening PR.

**Out of scope:**
- Automated tests (repo has no runner; acceptance is manual smoke).
- Multi-file batch upload, image formats, inline PDF preview, inline field editing (all explicitly deferred in the spec).
- New DB migrations — `invoices` already has `status`, `source`, `storage_path`, `file_hash`, `notes`, and the enum value `MANUAL_UPLOAD`. Confirmed against [supabase/migrations/001_initial_schema.sql:117-143](../../../supabase/migrations/001_initial_schema.sql).

**Spec:** [docs/superpowers/specs/2026-04-18-nav-restructure-and-invoice-upload-design.md](../specs/2026-04-18-nav-restructure-and-invoice-upload-design.md) (commit `8fe09b4`).

---

## File Structure

**New files**
- `app/api/invoices/upload/route.ts` — single POST handler. Responsibilities: role-gate via `requireRole('AP_CLERK')`, parse multipart form, validate PDF type + size, SHA-256 hash for dedup, upload to Supabase Storage `invoices` bucket, insert invoice row, fire the internal extract webhook. Mirrors `app/api/inbound/postmark/route.ts` almost line-for-line minus the email-specific bits.
- `app/invoice-upload/page.tsx` — client component. Responsibilities: render `AppShell`-wrapped single-column card with a dropzone, manage idle/selected/uploading/success/error state, POST `multipart/form-data`, display result.

**Modified files**
- `components/layout/AppShell.tsx` — change `PRIMARY_NAV` label "Invoices" → "Invoice Listing", rewrite the desktop `<nav>` JSX (lines ~197–221) into six role-gated sections with headers, rewrite the mobile drawer body (lines ~302–329) to render the same six sections with group headers between them.

That's it. Three files. No migrations, no new dependencies, no changes to other pages or routes.

---

## Task 1: Server route — POST /api/invoices/upload

**Files:**
- Create: `app/api/invoices/upload/route.ts`

Reference: [app/api/inbound/postmark/route.ts](../../../app/api/inbound/postmark/route.ts) is the existing canonical implementation of the same pipeline (upload → hash → dedup → storage → insert → fire extract). This task lifts that pattern, drops email-specific fields, and adds multipart parsing + role gating.

- [ ] **Step 1: Create the file with full handler**

Create `app/api/invoices/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { requireRole } from '@/lib/auth/require-role'

export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_CLERK')
  if (!gate.ok) return gate.response

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })

  // Duplicate check — return 409 with existing metadata so the UI can link to it
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number, supplier_name, created_at')
    .eq('file_hash', fileHash)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      {
        error: 'Duplicate',
        existing_id: existing.id,
        existing_invoice_number: existing.invoice_number,
        existing_supplier_name: existing.supplier_name,
        existing_created_at: existing.created_at,
      },
      { status: 409 },
    )
  }

  // Upload to Supabase Storage — raw fetch matches the postmark pattern
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const safeName = (file.name || 'invoice.pdf').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '')
  const storagePath = `manual/${year}/${month}/${Date.now()}-${safeName}`
  const storageUrl = `${supabaseUrl}/storage/v1/object/invoices/${storagePath}`

  const uploadRes = await fetch(storageUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false',
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    const detail = await uploadRes.json().catch(() => ({}))
    console.error('[invoice-upload] Storage error:', detail)
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
  }

  // Insert invoice row
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      status: 'INGESTED',
      source: 'MANUAL_UPLOAD',
      storage_path: `invoices/${storagePath}`,
      file_hash: fileHash,
      notes: `Uploaded manually by ${gate.user.email} · original: ${file.name}`,
    })
    .select('id')
    .single()

  if (invoiceError) {
    console.error('[invoice-upload] Insert error:', invoiceError.message)
    return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  }

  // Audit trail entry (service-role INSERT bypasses RLS)
  await supabase.from('audit_trail').insert({
    invoice_id: invoice.id,
    from_status: null,
    to_status: 'INGESTED',
    actor_email: gate.user.email,
    notes: `Manual upload · ${file.name}`,
  })

  // Fire-and-forget extraction trigger — same pattern as postmark line 164
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY! },
    body: JSON.stringify({ invoice_id: invoice.id }),
  }).catch(err => console.error(`[invoice-upload] Extraction trigger failed for ${invoice.id}:`, err.message))

  console.log(`[invoice-upload] ✓ ${gate.user.email} uploaded ${file.name} -> ${invoice.id}`)
  return NextResponse.json({ invoice_id: invoice.id, status: 'INGESTED' })
}
```

- [ ] **Step 2: Verify tsc**

Run:

```bash
npx tsc --noEmit
```

Expected: no NEW errors in `app/api/invoices/upload/route.ts`. Pre-existing errors in other files (`app/admin/email-log/page.tsx`, `app/api/expenses/extract/route.ts`, `lib/recon/reconcile.ts`, etc.) are fine — they existed before this change.

- [ ] **Step 3: Commit**

```bash
git add app/api/invoices/upload/route.ts
git commit -m "feat: POST /api/invoices/upload — manual PDF ingest mirroring postmark pipeline"
```

---

## Task 2: Client page — /invoice-upload

**Files:**
- Create: `app/invoice-upload/page.tsx`

Uses `react-dropzone` (already a dependency — see `package.json`). Renders inside `AppShell` so the sidebar shows around it. Client component (state machine).

- [ ] **Step 1: Create the file**

Create `app/invoice-upload/page.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import AppShell from '@/components/layout/AppShell'

const AMBER = '#E8960C'
const DARK = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT = '#F5F5F2'
const RED = '#EF4444'
const GREEN = '#16A34A'

const MAX_BYTES = 10 * 1024 * 1024

type State =
  | { kind: 'idle' }
  | { kind: 'selected'; file: File }
  | { kind: 'uploading'; file: File }
  | { kind: 'success'; invoiceId: string }
  | { kind: 'error'; message: string; duplicateInvoiceId?: string; file?: File }

export default function InvoiceUploadPage() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  const onDrop = useCallback((accepted: File[], rejected: { file: File; errors: { code: string; message: string }[] }[]) => {
    if (rejected.length > 0) {
      const first = rejected[0]
      const code = first.errors[0]?.code
      const msg = code === 'file-too-large'
        ? 'File exceeds 10 MB limit.'
        : code === 'file-invalid-type'
        ? 'Only PDF files are accepted.'
        : first.errors[0]?.message ?? 'File rejected.'
      setState({ kind: 'error', message: msg })
      return
    }
    if (accepted[0]) setState({ kind: 'selected', file: accepted[0] })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_BYTES,
    multiple: false,
  })

  const upload = async (file: File) => {
    setState({ kind: 'uploading', file })
    const body = new FormData()
    body.append('file', file)
    let res: Response
    try {
      res = await fetch('/api/invoices/upload', { method: 'POST', body })
    } catch {
      setState({ kind: 'error', message: 'Network error. Try again.', file })
      return
    }
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setState({ kind: 'success', invoiceId: data.invoice_id })
      return
    }
    if (res.status === 409) {
      setState({
        kind: 'error',
        message: `Already uploaded on ${new Date(data.existing_created_at).toLocaleString()}.`,
        duplicateInvoiceId: data.existing_id,
      })
      return
    }
    setState({ kind: 'error', message: data.error ?? `Upload failed (${res.status}).`, file })
  }

  const reset = () => setState({ kind: 'idle' })

  return (
    <AppShell>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: DARK, marginBottom: '4px' }}>Upload Invoice</h1>
        <p style={{ fontSize: '13px', color: '#6B6B5E', marginBottom: '20px' }}>
          Drop a PDF below. It will run through the same AI extraction pipeline as emailed invoices
          and land in the Review Queue.
        </p>

        {(state.kind === 'idle' || (state.kind === 'error' && !state.file)) && (
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? AMBER : BORDER}`,
              borderRadius: '10px',
              padding: '48px 16px',
              backgroundColor: isDragActive ? '#FEF3C7' : LIGHT,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📥</div>
            <div style={{ fontSize: '14px', color: DARK, fontWeight: 500 }}>
              {isDragActive ? 'Drop the PDF here' : 'Drop PDF here or click to browse'}
            </div>
            <div style={{ fontSize: '12px', color: '#8A8878', marginTop: '4px' }}>PDF only · Max 10 MB</div>
          </div>
        )}

        {state.kind === 'selected' && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '16px', backgroundColor: '#FFFFFF' }}>
            <div style={{ fontSize: '14px', color: DARK, marginBottom: '12px' }}>
              ✓ <strong>{state.file.name}</strong> ({(state.file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ flex: 1, padding: '10px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Remove
              </button>
              <button
                onClick={() => upload(state.file)}
                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Upload &amp; Extract
              </button>
            </div>
          </div>
        )}

        {state.kind === 'uploading' && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '24px', backgroundColor: '#FFFFFF', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: DARK }}>Uploading <strong>{state.file.name}</strong>…</div>
          </div>
        )}

        {state.kind === 'success' && (
          <div style={{ border: `1px solid ${GREEN}`, borderRadius: '10px', padding: '20px', backgroundColor: '#F0FDF4' }}>
            <div style={{ fontSize: '14px', color: DARK, marginBottom: '4px' }}>
              ✓ Uploaded. Extraction running…
            </div>
            <div style={{ fontSize: '12px', color: '#4B4B42', marginBottom: '16px' }}>
              Invoice ID: <code>{state.invoiceId}</code>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ flex: 1, padding: '10px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Upload another
              </button>
              <Link
                href="/review"
                style={{ flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', textDecoration: 'none', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
              >
                View in Review Queue
              </Link>
            </div>
          </div>
        )}

        {state.kind === 'error' && (
          <div style={{ border: `1px solid ${RED}`, borderRadius: '10px', padding: '16px', backgroundColor: '#FEF2F2', marginTop: state.file ? 0 : '12px' }}>
            <div style={{ fontSize: '14px', color: RED, marginBottom: '8px' }}>{state.message}</div>
            {state.duplicateInvoiceId && (
              <Link href={`/invoices/${state.duplicateInvoiceId}`} style={{ fontSize: '13px', color: AMBER, textDecoration: 'underline' }}>
                View existing invoice →
              </Link>
            )}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ padding: '8px 14px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Start over
              </button>
              {state.file && (
                <button
                  onClick={() => upload(state.file!)}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 2: Verify tsc**

Run:

```bash
npx tsc --noEmit
```

Expected: no NEW errors in `app/invoice-upload/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/invoice-upload/page.tsx
git commit -m "feat: /invoice-upload client page with dropzone"
```

---

## Task 3: AppShell restructure — sidebar + mobile drawer

**Files:**
- Modify: `components/layout/AppShell.tsx`

Three changes in one file: (a) rename `PRIMARY_NAV` entry for `/invoices` to "Invoice Listing"; (b) rewrite the desktop `<nav>` block to render six role-gated sections with renamed labels and the new Invoice Upload item; (c) rewrite the mobile drawer to render the same six sections with group headers.

The existing `MORE_NAV_BASE` constant is only used by the mobile drawer. In this task it is replaced by a structured constant `MORE_NAV_SECTIONS` that preserves section grouping.

- [ ] **Step 1: Update PRIMARY_NAV label**

In `components/layout/AppShell.tsx` around line 18, find:

```ts
const PRIMARY_NAV = [
  { href: '/',          label: 'Home',     icon: '🏠', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/dashboard', label: 'Dashboard',icon: '▦',  roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/review',    label: 'Review',   icon: '📋', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/approve',   label: 'Approve',  icon: '✅', roles: ['APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/invoices',  label: 'Invoices', icon: '🗒', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
]
```

Replace with (only the last line changes — label becomes "Invoice Listing"):

```ts
const PRIMARY_NAV = [
  { href: '/',          label: 'Home',            icon: '🏠', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/dashboard', label: 'Dashboard',       icon: '▦',  roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/review',    label: 'Review',          icon: '📋', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/approve',   label: 'Approve',         icon: '✅', roles: ['APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
  { href: '/invoices',  label: 'Invoice Listing', icon: '🗒', roles: ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'] },
]
```

- [ ] **Step 2: Replace MORE_NAV_BASE with MORE_NAV_SECTIONS**

Delete the entire `MORE_NAV_BASE` constant (lines ~26–38). In its place, add a structured sections constant plus a helper. The new constant follows the six-section order from the spec.

```ts
type NavItem = { href: string; label: string; icon: string; roles: string[] }
type NavSection = { heading: string; items: NavItem[] }

const INTERNAL_ROLES = ['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN']
const MANAGER_ROLES  = ['FINANCE_MANAGER','AP_ADMIN']
const APPROVER_UP    = ['APPROVER','FINANCE_MANAGER','AP_ADMIN']

// Mirrors the sidebar structure used in both desktop nav and mobile drawer.
// "Main" items that live in the mobile bottom bar (PRIMARY_NAV) are NOT included here.
const MORE_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Main',
    items: [
      { href: '/expenses',  label: 'Expense Listing', icon: '🧾', roles: INTERNAL_ROLES },
      { href: '/xero-push', label: 'Submit to Xero',  icon: '📤', roles: APPROVER_UP },
      { href: '/chat',      label: 'Team Chat',       icon: '💬', roles: INTERNAL_ROLES },
      { href: '/help',      label: 'Help',            icon: '❓', roles: INTERNAL_ROLES },
    ],
  },
  {
    heading: 'Manual Submission',
    items: [
      // Expense Capture is gated client-side by canCapture — use a sentinel role that no user ever has,
      // and render it separately in the drawer using the canCapture flag (same pattern as desktop).
      { href: '/invoice-upload', label: 'Invoice Upload', icon: '📥', roles: INTERNAL_ROLES },
    ],
  },
  {
    heading: 'Master Data',
    items: [
      { href: '/suppliers', label: 'Supplier Listing', icon: '🏢', roles: INTERNAL_ROLES },
      { href: '/gl-codes',  label: 'GL Code Listing',  icon: '📒', roles: INTERNAL_ROLES },
    ],
  },
  {
    heading: 'Data Quality Audit',
    items: [
      { href: '/duplicates', label: 'Duplicate Listing', icon: '⚠️', roles: MANAGER_ROLES },
    ],
  },
  {
    heading: 'Supplier Reconciliation',
    items: [
      { href: '/statements', label: 'Supplier Recon', icon: '📑', roles: MANAGER_ROLES },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { href: '/admin/users',     label: 'Users',    icon: '👥', roles: MANAGER_ROLES },
      { href: '/admin/email-log', label: 'Email Log',icon: '📨', roles: MANAGER_ROLES },
      { href: '/admin/settings',  label: 'Settings', icon: '⚙️', roles: MANAGER_ROLES },
    ],
  },
]
```

Note: Expense Capture is intentionally NOT in `MORE_NAV_SECTIONS` because its visibility is gated by the `canCapture` user-profile flag, not by role. It is inserted into the Manual Submission section inline (see Step 3 and Step 4).

- [ ] **Step 3: Rewrite the desktop `<nav>` block**

In `AppShell.tsx`, locate the desktop `<nav>` at lines ~197–221 (begins with `<nav style={{ padding: '12px 0', flex: 1 }}>` and ends after the conditional `Admin` block). Replace the entire contents with a role-gated six-section render.

Replace:

```tsx
          <nav style={{ padding: '12px 0', flex: 1 }}>
            {role && <>
            {!collapsed && <div style={{ padding: '0 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Main</div>}
            <NavItem href="/"          label="Home"          icon="🏠" />
            <NavItem href="/dashboard" label="Dashboard"     icon="▦" />
            <NavItem href="/invoices"  label="Invoices"      icon="🗒" />
            {['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/review"    label="Review Queue"  icon="📋" badge={reviewCount} />}
            {['APPROVER','FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/approve"   label="Approve Queue" icon="✅" badge={approveCount} />}
            {['FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/duplicates" label="Duplicates"   icon="⚠️" badge={duplicateCount} />}
            <NavItem href="/suppliers"  label="Suppliers"    icon="🏢" />
            {['FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/statements" label="Reconciliation" icon="📑" />}
            <NavItem href="/gl-codes"   label="GL Codes"     icon="📒" />
            {['APPROVER','FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/xero-push"  label="Push to Xero" icon="📤" />}
            {['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/expenses"  label="Expenses"     icon="🧾" />}
            {['AP_CLERK','APPROVER','FINANCE_MANAGER','AP_ADMIN'].includes(role) && <NavItem href="/chat"      label="Team Chat"    icon="💬" />}
            {canCapture && <NavItem href="/capture" label="Capture" icon="📷" />}
            <NavItem href="/help" label="Help" icon="❓" />
            {['FINANCE_MANAGER','AP_ADMIN'].includes(role) && <>
              {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Admin</div>}
              <NavItem href="/admin/users"      label="Users"      icon="👥" />
              <NavItem href="/admin/email-log"  label="Email Log"  icon="📨" />
              <NavItem href="/admin/settings" label="Settings" icon="⚙️" />
            </>}
            </>}
          </nav>
```

With:

```tsx
          <nav style={{ padding: '12px 0', flex: 1 }}>
            {role && <>
            {/* Main */}
            {!collapsed && <div style={{ padding: '0 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Main</div>}
            <NavItem href="/"          label="Home"            icon="🏠" />
            <NavItem href="/dashboard" label="Dashboard"       icon="▦" />
            <NavItem href="/invoices"  label="Invoice Listing" icon="🗒" />
            <NavItem href="/expenses"  label="Expense Listing" icon="🧾" />
            <NavItem href="/review"    label="Review Queue"    icon="📋" badge={reviewCount} />
            {APPROVER_UP.includes(role) && <NavItem href="/approve"   label="Approve Queue" icon="✅" badge={approveCount} />}
            {APPROVER_UP.includes(role) && <NavItem href="/xero-push" label="Submit to Xero" icon="📤" />}
            <NavItem href="/chat" label="Team Chat" icon="💬" />
            <NavItem href="/help" label="Help" icon="❓" />

            {/* Manual Submission */}
            {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Manual Submission</div>}
            {canCapture && <NavItem href="/capture" label="Expense Capture" icon="📷" />}
            <NavItem href="/invoice-upload" label="Invoice Upload" icon="📥" />

            {/* Master Data */}
            {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Master Data</div>}
            <NavItem href="/suppliers" label="Supplier Listing" icon="🏢" />
            <NavItem href="/gl-codes"  label="GL Code Listing"  icon="📒" />

            {/* Data Quality Audit + Supplier Reconciliation + Admin — all MANAGER_ROLES */}
            {MANAGER_ROLES.includes(role) && <>
              {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Data Quality Audit</div>}
              <NavItem href="/duplicates" label="Duplicate Listing" icon="⚠️" badge={duplicateCount} />

              {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Supplier Reconciliation</div>}
              <NavItem href="/statements" label="Supplier Recon" icon="📑" />

              {!collapsed && <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Admin</div>}
              <NavItem href="/admin/users"     label="Users"     icon="👥" />
              <NavItem href="/admin/email-log" label="Email Log" icon="📨" />
              <NavItem href="/admin/settings"  label="Settings"  icon="⚙️" />
            </>}
            </>}
          </nav>
```

Note the constants `APPROVER_UP` and `MANAGER_ROLES` come from Step 2. `INTERNAL_ROLES` is used inside `MORE_NAV_SECTIONS` but not referenced in this JSX because every item that gates by "any internal role" is rendered unconditionally (the whole `<nav>` is already gated by `{role && <>...</>}`).

- [ ] **Step 4: Rewrite the mobile drawer body**

In `AppShell.tsx`, locate the mobile drawer content at lines ~302–329 (begins with `<div style={{ padding: '0 8px', display: 'grid' ...`). The current code is a single 2-column grid over `MORE_NAV_BASE` plus a conditional Capture item. Replace it with a sectioned render over `MORE_NAV_SECTIONS`, with headers between sections and Expense Capture inserted inline into the Manual Submission section.

Replace:

```tsx
            <div style={{ padding: '0 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[...MORE_NAV_BASE.filter(i => role && i.roles.includes(role)), ...(canCapture ? [{ href: '/capture', label: 'Capture', icon: '📷', roles: [] }] : [])].map(({ href, label, icon }) => {
                const badge  = getBadge(href)
                const active = isActive(href)
                return (
                  <Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => setDrawerOpen(false)}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 16px', borderRadius: '10px',
                      backgroundColor: active ? '#FEF3C7' : LIGHT,
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: '20px' }}>{icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: active ? '700' : '500', color: active ? AMBER : DARK }}>{label}</span>
                      {badge > 0 && (
                        <span style={{ marginLeft: 'auto', backgroundColor: '#EF4444', color: WHITE, fontSize: '10px', fontWeight: '700', borderRadius: '8px', padding: '1px 6px' }}>
                          {badge}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
```

With:

```tsx
            <div style={{ padding: '0 8px' }}>
              {MORE_NAV_SECTIONS.map((section) => {
                // Filter items by role
                const items = section.items.filter(i => role && i.roles.includes(role))
                // Inject Expense Capture into Manual Submission if canCapture
                const sectionItems = section.heading === 'Manual Submission' && canCapture
                  ? [{ href: '/capture', label: 'Expense Capture', icon: '📷', roles: [] as string[] }, ...items]
                  : items
                if (sectionItems.length === 0) return null
                return (
                  <div key={section.heading} style={{ marginBottom: '12px' }}>
                    <div style={{ padding: '8px 8px 4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
                      {section.heading}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      {sectionItems.map(({ href, label, icon }) => {
                        const badge  = getBadge(href)
                        const active = isActive(href)
                        return (
                          <Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => setDrawerOpen(false)}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '14px 16px', borderRadius: '10px',
                              backgroundColor: active ? '#FEF3C7' : LIGHT,
                              position: 'relative',
                            }}>
                              <span style={{ fontSize: '20px' }}>{icon}</span>
                              <span style={{ fontSize: '14px', fontWeight: active ? '700' : '500', color: active ? AMBER : DARK }}>{label}</span>
                              {badge > 0 && (
                                <span style={{ marginLeft: 'auto', backgroundColor: '#EF4444', color: WHITE, fontSize: '10px', fontWeight: '700', borderRadius: '8px', padding: '1px 6px' }}>
                                  {badge}
                                </span>
                              )}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
```

- [ ] **Step 5: Verify tsc**

Run:

```bash
npx tsc --noEmit
```

Expected: no NEW errors in `components/layout/AppShell.tsx`. If `NavSection` / `NavItem` types conflict with existing names in the file, resolve by prefixing (e.g. `NavSectionDef`). The existing inline `NavItem` component is defined inside the desktop render function (~line 155) and does not collide with a top-level type named `NavItem` — TypeScript treats them as different scopes.

- [ ] **Step 6: Visual smoke (optional, only if dev env is available)**

Start the dev server locally (`npm run dev`) and sign in as each role in turn. Confirm for each role:
- The section headers listed for that role appear.
- No empty section headers.
- "Invoice Listing" replaces "Invoices" in both the desktop sidebar and the mobile bottom bar.
- Clicking **Invoice Upload** navigates to the new page and it renders inside the AppShell.

If no dev env available, skip — Task 4 (manual verification) covers this end-to-end.

- [ ] **Step 7: Commit**

```bash
git add components/layout/AppShell.tsx
git commit -m "feat: restructure AppShell nav into six sections, add Invoice Upload link"
```

---

## Task 4: End-to-end manual verification (user-side)

No agent can do this — it requires a running dev server with a configured Supabase project, the `invoices` storage bucket, `INTERNAL_API_KEY` set in `.env.local`, and at least one logged-in internal user. Run through this checklist:

- [ ] **Step 1: Smoke the nav**
  - Sign in as AP_CLERK. Desktop sidebar shows sections: Main, Manual Submission, Master Data. No Admin/Data Quality/Reconciliation. Invoice Upload link is visible. Labels all match the spec (Invoice Listing / Expense Listing / Submit to Xero / Supplier Listing / GL Code Listing).
  - Sign in as FINANCE_MANAGER. All six sections visible. Duplicate Listing, Supplier Recon, and Admin items present.
  - On a mobile viewport (browser devtools < 768px), confirm the bottom bar still has 5 items ending in "Invoice Listing" and the More drawer shows six labeled section headers.

- [ ] **Step 2: Smoke Invoice Upload — happy path**
  - As AP_CLERK, click Invoice Upload.
  - Drag a fresh PDF (one that has not been uploaded before) onto the dropzone. Filename + size appears.
  - Click "Upload & Extract". Spinner, then success card with invoice ID.
  - Click "View in Review Queue". Invoice appears once extraction completes (typically within ~30 seconds). In the database, row has `source = 'MANUAL_UPLOAD'`, `status` has moved from `INGESTED` → `PENDING_REVIEW` (assuming extraction succeeded).

- [ ] **Step 3: Smoke duplicate detection**
  - Upload the same PDF a second time.
  - Expect an error card with "Already uploaded on `<timestamp>`" and a "View existing invoice →" link. Clicking it opens `/invoices/<existing_id>`.

- [ ] **Step 4: Smoke client-side validation**
  - Try to drop a `.txt` or `.jpg` file — dropzone rejects it, no request is made.
  - Try to drop a PDF > 10 MB — dropzone rejects it with "File exceeds 10 MB limit."

- [ ] **Step 5: Smoke role gate**
  - Not logged in: navigate to `/invoice-upload`. Middleware should redirect to `/login`.
  - Logged in, but POST directly to `/api/invoices/upload` with a cookie from a user whose profile row has `is_active = false` (or a role not in `INTERNAL_ROLES`). Expect 403.

- [ ] **Step 6: Smoke audit trail**
  - In `audit_trail`, the row for the uploaded invoice should have `actor_email = <uploader's email>`, `from_status = null`, `to_status = 'INGESTED'`, `notes` mentioning the original filename.

If any step fails, file an issue against the relevant task (1, 2, or 3) and re-dispatch the implementer with the specific failure.

---

## Self-Review

**Spec coverage:**
- Part A — sidebar restructure: covered by Task 3 (Steps 1–4 and Step 6).
- Part B — `/invoice-upload` page: covered by Task 2 (client page) and Task 1 (server route).
- Section-header visibility rules: reflected in Task 3 Step 3 (desktop gates `MANAGER_ROLES` wraps Data Quality / Reconciliation / Admin; Manual Submission and Master Data always render for internal roles; Main always renders).
- Mobile drawer section headers: covered by Task 3 Step 4 (filter items first, skip empty sections).
- File types, size limit, role gate, duplicate handling, fire-and-forget extract trigger, audit trail: all covered in Task 1 and Task 2 code blocks.
- Schema assumption "no migrations needed": confirmed in the plan header — `invoices` has all required columns per the migration 001 review included in the plan.

**Placeholder scan:** no "TBD" / "handle appropriately" / "similar to Task N". Every step contains complete code or an exact command.

**Type consistency:** `NavItem` (type) and `NavItem` (inline component inside the desktop renderer) share a name but different scopes — called out in Task 3 Step 5 with a mitigation. `INTERNAL_ROLES`, `MANAGER_ROLES`, `APPROVER_UP` are defined in Task 3 Step 2 and reused in Task 3 Step 3. `MORE_NAV_SECTIONS` is defined once in Step 2 and consumed in Step 4.

**Ordering:** Tasks 1 → 2 → 3 → 4. If Task 3 landed before Tasks 1 or 2 the sidebar would link to a 404; ordering prevents this.
