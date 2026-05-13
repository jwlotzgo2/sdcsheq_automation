-- ============================================================
-- Migration: 008_invoice_expense_fields.sql
-- Purpose:   Add columns the /capture (mobile expense capture) and
--            /expenses listing flows have been assuming exist on
--            public.invoices. Without these, every expense submission
--            fails with "Could not find the 'pdf_url' column ..." and
--            /expenses returns zero rows because record_type is missing.
--
--            record_type:   distinguishes EMAIL/upload invoices from
--                           mobile-captured expense receipts so /expenses
--                           and /invoices can show disjoint lists.
--            submitted_by:  email of the field user who captured the
--                           receipt (denormalised — survives user deletion).
--            client_name:   optional client the expense should be billed to.
--            cost_centre_id: cost centre at the header level (in addition
--                           to the per-line cost_centre_id that already
--                           exists on invoice_line_items) — used by the
--                           /expenses filter dropdown.
--
--            The capture flow stores the receipt file via the existing
--            storage_path column (matching the Postmark and manual-upload
--            pattern), so no new pdf_url column is needed.
-- ============================================================

alter table public.invoices add column if not exists record_type    text;
alter table public.invoices add column if not exists submitted_by   text;
alter table public.invoices add column if not exists client_name    text;
alter table public.invoices add column if not exists cost_centre_id uuid references public.cost_centres(id);

-- Backfill existing rows as INVOICE before tightening the constraint.
update public.invoices set record_type = 'INVOICE' where record_type is null;

alter table public.invoices alter column record_type set default 'INVOICE';
alter table public.invoices alter column record_type set not null;

alter table public.invoices
  drop constraint if exists invoices_record_type_check;
alter table public.invoices
  add constraint invoices_record_type_check
  check (record_type in ('INVOICE','EXPENSE'));

-- Supports the /expenses listing query:
--   where record_type = 'EXPENSE' order by invoice_date desc
create index if not exists idx_invoices_record_type_date
  on public.invoices (record_type, invoice_date desc);
