-- 005: Xero invoice match results
-- Stores matches between ingested invoices and existing Xero ACCPAY bills

create table xero_invoice_matches (
  id                uuid primary key default uuid_generate_v4(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  xero_bill_id      text,
  xero_bill_number  text,
  xero_contact_id   text,
  xero_contact_name text,
  xero_amount       numeric(12,2),
  xero_date         date,
  match_status      text not null default 'PENDING',
  match_confidence  numeric(3,2) default 0,
  match_details     jsonb default '{}'::jsonb,
  linked_at         timestamptz,
  linked_by         uuid references user_profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One match record per invoice
create unique index idx_xero_invoice_matches_invoice on xero_invoice_matches(invoice_id);
create index idx_xero_invoice_matches_status on xero_invoice_matches(match_status);

-- Auto-update updated_at
create trigger set_updated_at
  before update on xero_invoice_matches
  for each row execute function public.handle_updated_at();

-- RLS
alter table xero_invoice_matches enable row level security;

create policy "Authenticated users can view matches"
  on xero_invoice_matches for select
  to authenticated
  using (true);

create policy "Service role can manage matches"
  on xero_invoice_matches for all
  to service_role
  using (true)
  with check (true);

create policy "Reviewers can update matches"
  on xero_invoice_matches for update
  to authenticated
  using (public.is_role('REVIEWER'))
  with check (public.is_role('REVIEWER'));
