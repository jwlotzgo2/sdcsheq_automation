-- ============================================================
-- Migration: 006_tighten_rls.sql
-- Purpose:   Replace permissive "USING (true)" policies from 001
--            with role-gated policies, remove forgeable audit inserts,
--            and restrict user_profiles UPDATEs to non-privileged
--            columns (prevents self-promotion via RLS bypass).
--
-- Note:      Routes using SUPABASE_SERVICE_ROLE_KEY still bypass
--            RLS. They MUST enforce role in application code
--            (see lib/auth/require-role.ts).
-- ============================================================

-- ── invoices ────────────────────────────────────────────────
drop policy if exists "Authenticated users can view invoices" on public.invoices;
drop policy if exists "Service role can insert invoices" on public.invoices;

create policy "Internal users can view invoices"
  on public.invoices for select
  to authenticated
  using (public.is_role('AP_CLERK'));

-- Inserts happen via SERVICE_ROLE_KEY (extract, postmark). No
-- "authenticated" INSERT policy needed — service role bypasses RLS.

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

-- Inserts are service-role only — no authenticated INSERT policy,
-- so authed users cannot forge entries.

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

-- ── user_profiles column-level restriction ──────────────────
-- Prevents self-promotion: authenticated users can only UPDATE
-- the full_name column on their own row (RLS on user_id stays).
-- role and is_active changes must go through SERVICE_ROLE_KEY paths.
revoke update on public.user_profiles from authenticated;
grant update (full_name) on public.user_profiles to authenticated;
