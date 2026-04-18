-- ============================================================
-- Migration: 006_tighten_rls.sql
-- Purpose:   Replace permissive "USING (true)" / "WITH CHECK (true)"
--            policies with role-gated policies, and restrict
--            user_profiles UPDATE at the column level to prevent
--            self-promotion to AP_ADMIN.
--
-- Note:      Production policy names are tracked here as they
--            actually exist (NOT the names from migration 001 —
--            the DB has drifted from that file). Routes using
--            SUPABASE_SERVICE_ROLE_KEY still bypass RLS and MUST
--            enforce role in application code (see
--            lib/auth/require-role.ts).
-- ============================================================

-- ── invoices ────────────────────────────────────────────────
-- Drop the USING(true) SELECT and WITH CHECK(true) INSERT policies.
drop policy if exists "invoices_select" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;

create policy "invoices_select"
  on public.invoices for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- INSERT happens via SERVICE_ROLE_KEY (postmark, invoice-upload,
-- extract). No authenticated INSERT policy needed.

-- ── invoice_line_items ──────────────────────────────────────
drop policy if exists "line_items_select" on public.invoice_line_items;

create policy "line_items_select"
  on public.invoice_line_items for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── ocr_extractions ─────────────────────────────────────────
drop policy if exists "ocr_select" on public.ocr_extractions;

create policy "ocr_select"
  on public.ocr_extractions for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── audit_trail ─────────────────────────────────────────────
-- Drop both: USING(true) SELECT and WITH CHECK(true) INSERT.
-- INSERTs come from service-role paths; non-admins have no read access.
drop policy if exists "audit_select" on public.audit_trail;
drop policy if exists "audit_insert" on public.audit_trail;

create policy "audit_select"
  on public.audit_trail for select
  to authenticated
  using (public.is_role('AP_ADMIN'));

-- No authenticated INSERT policy — service role writes bypass RLS,
-- so authed users cannot forge audit entries.

-- ── suppliers ───────────────────────────────────────────────
drop policy if exists "suppliers_select" on public.suppliers;

create policy "suppliers_select"
  on public.suppliers for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── gl_codes ────────────────────────────────────────────────
drop policy if exists "gl_codes_select" on public.gl_codes;

create policy "gl_codes_select"
  on public.gl_codes for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- ── user_profiles column-level restriction ──────────────────
-- Prevents self-promotion: authenticated users can only UPDATE
-- the full_name column on their own row. The existing
-- user_profiles_update_own RLS policy (user_id = auth.uid())
-- continues to gate which rows — but combined with column-level
-- GRANT, only full_name is writable from the authenticated role.
--
-- Role / is_active / can_capture_expenses / supplier_id changes
-- must go through SERVICE_ROLE_KEY server routes (see
-- app/api/admin/users/[userId]/update/route.ts).
revoke update on public.user_profiles from authenticated;
grant update (full_name) on public.user_profiles to authenticated;
