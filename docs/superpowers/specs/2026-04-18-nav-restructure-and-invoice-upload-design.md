# Nav Restructure + Invoice Upload — Design Spec

**Date:** 2026-04-18
**Status:** Approved, ready for implementation plan.
**Scope:** Two cohesive changes delivered together so the nav doesn't show a broken link:
1. Restructure the sidebar into six named sections with label renames.
2. Add a new `/invoice-upload` page that accepts a single PDF and routes it through the existing AI-extraction pipeline.

---

## Part A — Sidebar Restructure

### Goal

Replace the current single-section `Main` + conditional `Admin` sidebar in [components/layout/AppShell.tsx](../../../components/layout/AppShell.tsx) with six role-gated sections that match the team's mental model of the product.

### Final structure

| Section | Item | Route | Role gate | Notes |
|---|---|---|---|---|
| **Main** | Home | `/` | AP_CLERK+ | |
|  | Dashboard | `/dashboard` | AP_CLERK+ | |
|  | Invoice Listing | `/invoices` | AP_CLERK+ | renamed from "Invoices" |
|  | Expense Listing | `/expenses` | AP_CLERK+ | renamed from "Expenses" |
|  | Review Queue | `/review` | AP_CLERK+ | badge: pending review count |
|  | Approve Queue | `/approve` | APPROVER+ | badge: pending approval count |
|  | Submit to Xero | `/xero-push` | APPROVER+ | renamed from "Push to Xero" |
|  | Team Chat | `/chat` | AP_CLERK+ | |
|  | Help | `/help` | AP_CLERK+ | |
| **Manual Submission** | Expense Capture | `/capture` | `canCapture` flag | renamed from "Capture" |
|  | Invoice Upload | `/invoice-upload` | AP_CLERK+ | **NEW** |
| **Master Data** | Supplier Listing | `/suppliers` | AP_CLERK+ | renamed from "Suppliers" |
|  | GL Code Listing | `/gl-codes` | AP_CLERK+ | renamed from "GL Codes" |
| **Data Quality Audit** | Duplicate Listing | `/duplicates` | FINANCE_MANAGER+ | renamed from "Duplicates", badge: unreviewed duplicate count |
| **Supplier Reconciliation** | Supplier Recon | `/statements` | FINANCE_MANAGER+ | renamed from "Reconciliation" |
| **Admin** | Users | `/admin/users` | FINANCE_MANAGER+ | |
|  | Email Log | `/admin/email-log` | FINANCE_MANAGER+ | |
|  | Settings | `/admin/settings` | FINANCE_MANAGER+ | |

"AP_CLERK+" means any internal role (AP_CLERK, APPROVER, FINANCE_MANAGER, AP_ADMIN) — same convention used in the existing nav.

### Section-header visibility rules

A section header must render only when at least one of its items will render for the current role, to avoid empty headers on restricted views. Specifically:
- **Main** — always renders for any internal role.
- **Manual Submission** — renders if user has `canCapture === true` OR role is AP_CLERK+. In practice always renders for internal roles (Invoice Upload is AP_CLERK+).
- **Master Data** — always renders for any internal role.
- **Data Quality Audit** — renders only for FINANCE_MANAGER+.
- **Supplier Reconciliation** — renders only for FINANCE_MANAGER+.
- **Admin** — renders only for FINANCE_MANAGER+.

### Desktop layout

Identical to today's section rendering pattern (faint uppercase header label, then `NavItem` components). No visual-design changes to the sidebar itself — same colors, same collapsed state behavior, same badge styling.

### Mobile layout

- **Bottom primary bar**: unchanged — Home / Dashboard / Review / Approve / Invoice Listing. `PRIMARY_NAV` label updates to "Invoice Listing".
- **"More" drawer**: items currently rendered as a single 2-column grid. Replace with a stacked layout that groups by the six sections above, with a small header above each group. Layout inside each group stays 2-column grid.

### Files to change

- [components/layout/AppShell.tsx](../../../components/layout/AppShell.tsx) — the `PRIMARY_NAV` constant, the `MORE_NAV_BASE` constant, the inline desktop `<nav>` JSX (lines 197–221), and the mobile drawer JSX (lines 302–329).

No other files are in scope for Part A. The underlying page components and routes keep their existing paths; labels change only in the nav.

---

## Part B — Invoice Upload page

### Goal

A simple single-PDF drop-to-upload page at `/invoice-upload` that pushes the file into the same AI-extraction pipeline email ingest uses, so a reviewer can process a manually-supplied invoice the same way they process an emailed one.

### User flow

1. User clicks **Invoice Upload** in the sidebar.
2. Page renders a centered card with a drop zone (labeled "Drop PDF here or click to browse · Max 10 MB · PDF only").
3. User drops a PDF (or clicks to pick). Dropzone validates MIME type and size client-side.
4. Card shows the selected filename + size with **Remove** and **Upload & Extract** buttons.
5. User clicks **Upload & Extract**.
6. Page posts `multipart/form-data` to `POST /api/invoices/upload` with the file.
7. On 200: card shows "✓ Uploaded. Extraction running…" with two actions — **Upload another** (resets dropzone) and **View in Review Queue** (navigates to `/review`).
8. On 409 (duplicate): inline error "Already uploaded on `<ingested_at>`. [View existing]" with a link to the existing invoice detail page.
9. On other error: inline error message + a **Retry** button that re-submits the same file.

Extraction is async (fire-and-forget), so the invoice will not be visible in Review Queue immediately — same deferred behavior as email ingest. The success message explicitly says "Extraction running" to set expectations.

### Client component

- New file: [app/invoice-upload/page.tsx](../../../app/invoice-upload/page.tsx) — client component using `react-dropzone` (already in `package.json`). State machine with five states:
  - `idle` — empty dropzone
  - `selected` — file picked, not yet uploaded
  - `uploading` — POST in flight
  - `success` — 200 received, showing "Upload another / View in Review"
  - `error` — non-200, showing message + retry
- Uses the existing `AppShell` layout (so the sidebar renders around it).
- MIME validation: `application/pdf` only. Size: client-side reject above 10 MB before posting.
- No PDF preview on this page (out of scope — deferred).

### Server route

- New file: [app/api/invoices/upload/route.ts](../../../app/api/invoices/upload/route.ts) — single POST handler.

**Handler flow:**

1. `const gate = await requireRole(request, 'AP_CLERK'); if (!gate.ok) return gate.response`.
2. Parse `multipart/form-data` via `request.formData()`. Extract the `file` field; 400 if missing or wrong type.
3. Server-side size check (≤ 10 MB). 413 if over.
4. Read bytes, compute SHA-256 `file_hash`.
5. Duplicate check: `SELECT id, ingested_at, uploaded_by_email FROM invoices WHERE file_hash = $hash`. If found: return `409 { error: "Duplicate", existing_id, existing_ingested_at, existing_uploader }`.
6. Upload to Supabase Storage bucket `invoices` at path `manual/${yyyy}/${mm}/${invoiceId}.pdf` using SERVICE_ROLE_KEY client.
7. INSERT into `public.invoices`:
   - `status = 'INGESTED'`
   - `source = 'MANUAL_UPLOAD'` (enum value exists in migration 001)
   - `file_hash`, `storage_path`, `original_filename`
   - `uploaded_by_email = gate.user.email`
   - `ingested_at = now()`
8. Fire-and-forget `fetch('${SITE_URL}/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': INTERNAL_API_KEY }, body: JSON.stringify({ invoice_id }) })`. Same pattern as postmark line 164. Uses the Task 1 `INTERNAL_API_KEY`.
9. Return `{ invoice_id, status: 'INGESTED' }`.

**Error shapes**: `{ error: string }` with 400 / 401 / 403 / 409 / 413 / 500 as appropriate. Match existing API-route convention.

### Storage bucket

Assumption: the `invoices` Supabase Storage bucket already exists and is used by the postmark ingestion route. If not, an additional provisioning step (one SQL `insert into storage.buckets` + policy) will be needed; this is flagged as a pre-flight verification step in the implementation plan rather than a new migration, because bucket provisioning is typically a one-time manual task.

### Schema requirements

No migrations needed — `invoices` already has columns `file_hash`, `storage_path`, `source`, `status`, and `uploaded_by_email` (inherited from postmark's insert shape). Confirm during implementation by reading migration 001; if `uploaded_by_email` or `original_filename` is missing, use the actual postmark insert as the authoritative column list and adjust accordingly.

### Out of scope

- Multi-file batch upload.
- Image (JPG/PNG) support.
- Inline PDF preview before submit.
- Inline extracted-field editing (deferred — Review Queue already does this).
- Progress bar during upload (spinner is sufficient for a 10 MB max file).

---

## Cross-cutting concerns

### Role gate on `/invoice-upload`

The page is a client component but does not render role-sensitive data directly; the real gate is on the server route (Task-5 style). The nav item's visibility is gated client-side via `AppShell`'s existing role check, which is a discoverability-level protection — not security. Attempting to POST to `/api/invoices/upload` without the right role gets 403 from `requireRole`.

### Testing

No test runner in the repo (same as the auth hardening work). Acceptance is manual:

1. As AP_CLERK: upload a fresh PDF → expect 200, row in `invoices` with `source='MANUAL_UPLOAD'`, extraction fires (confirm in Review Queue within ~30s or server logs).
2. As AP_CLERK: upload the same PDF a second time → expect 409 with reference to the first invoice.
3. As AP_CLERK: upload a non-PDF → client-side rejection, no request sent.
4. As AP_CLERK: upload a 15 MB PDF → client-side rejection (or 413 from server if client check is bypassed).
5. Not logged in: navigate to `/invoice-upload` → redirected to `/login` by middleware.
6. Logged in but no session cookie on the upload POST → 401 from `requireRole`.
7. Restructured sidebar: verify each section header appears for the right role, items render in the right order, renames applied, the new **Invoice Upload** item links correctly.
8. Mobile drawer: sections render with headers, 2-column grid per section.

### Rollout ordering

Parts A and B land together in a single PR. If split, the nav would either show a broken link to `/invoice-upload` (Part A first) or ship a reachable-only-by-URL page (Part B first). Both are avoidable by keeping them bundled.

### Files touched (complete list)

- [components/layout/AppShell.tsx](../../../components/layout/AppShell.tsx) — restructure.
- [app/invoice-upload/page.tsx](../../../app/invoice-upload/page.tsx) — NEW client page.
- [app/api/invoices/upload/route.ts](../../../app/api/invoices/upload/route.ts) — NEW server route.

Three files total. No migrations, no new dependencies, no changes to other pages or routes.
