-- ============================================================
-- Migration: 007_duplicate_log_update_policy.sql
-- Purpose:   Add UPDATE policy on duplicate_log so reviewers can
--            mark entries as reviewed. Table previously had only
--            SELECT + INSERT policies, so all browser-side updates
--            were silently denied by RLS (0 rows affected).
--
--            The Duplicate Listing nav is gated to FINANCE_MANAGER+
--            (see components/layout/AppShell.tsx), so the policy
--            matches that role requirement.
-- ============================================================

create policy "duplicate_log_update"
  on public.duplicate_log for update
  to authenticated
  using (public.is_role('FINANCE_MANAGER'))
  with check (public.is_role('FINANCE_MANAGER'));
