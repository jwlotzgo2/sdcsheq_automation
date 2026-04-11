-- ============================================================
-- Xero Invoice Match — stores potential matches found in Xero
-- Migration: 005_xero_invoice_matches.sql
-- ============================================================

-- Add XERO_LINKED to the invoice_status enum
alter type invoice_status add value if not exists 'XERO_LINKED' after 'XERO_PUSH_FAILED';

-- ── XERO INVOICE MATCHES ────────────────────────────────────
-- When a new invoice is ingested, we search Xero for similar bills.
-- Matches are stored here for the clerk to review and optionally link.
create table if not exists public.xero_invoice_matches (
  id                  uuid primary key default uuid_generate_v4(),
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  xero_invoice_id     text not null,           -- Xero InvoiceID (GUID)
  xero_invoice_number text,                    -- Xero invoice/bill number
  xero_contact_name   text,                    -- Supplier name in Xero
  xero_contact_id     text,                    -- Xero ContactID
  xero_date           date,                    -- Invoice date in Xero
  xero_due_date       date,                    -- Due date in Xero
  xero_total          numeric(12,2),           -- Total amount in Xero
  xero_status         text,                    -- DRAFT, SUBMITTED, AUTHORISED, PAID, etc.
  xero_vat_number     text,                    -- Supplier VAT/Tax number from Xero
  match_confidence    text not null default 'LOW', -- LOW, MEDIUM, HIGH
  match_fields        jsonb,                   -- Which fields matched: { supplier: true, vat: true, date: true, amount: true }
  linked              boolean not null default false,  -- Has the clerk linked this?
  linked_by           text,                    -- Email of clerk who linked
  linked_at           timestamptz,
  created_at          timestamptz not null default now()
);

-- Indexes
create index idx_xero_matches_invoice_id on public.xero_invoice_matches(invoice_id);
create index idx_xero_matches_xero_invoice_id on public.xero_invoice_matches(xero_invoice_id);

-- RLS
alter table public.xero_invoice_matches enable row level security;

create policy "Authenticated users can view Xero matches"
  on public.xero_invoice_matches for select
  to authenticated
  using (true);

create policy "Reviewers can manage Xero matches"
  on public.xero_invoice_matches for all
  to authenticated
  using (is_role('REVIEWER'));
