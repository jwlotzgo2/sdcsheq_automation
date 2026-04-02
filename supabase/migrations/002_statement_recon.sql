-- supabase/migrations/002_statement_recon.sql

-- Per-supplier layout config trained from a sample PDF
create table supplier_statement_configs (
  id                    uuid primary key default gen_random_uuid(),
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  trained_by            text not null,
  trained_at            timestamptz not null default now(),
  sample_storage_path   text not null,
  date_format           text not null default 'DD/MM/YYYY',
  reference_column_hint text,
  reference_pattern     text,
  debit_label           text,
  credit_label          text,
  payment_identifier    text,
  opening_balance_label text,
  closing_balance_label text,
  layout_notes          text,
  sample_lines          jsonb,
  is_active             boolean not null default true,
  unique(supplier_id)
);

-- One record per ingested supplier statement PDF
create table supplier_statements (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references suppliers(id),
  config_id         uuid references supplier_statement_configs(id),
  storage_path      text not null,
  statement_date    date,
  date_from         date,
  date_to           date,
  opening_balance   numeric(12,2),
  closing_balance   numeric(12,2),
  currency          text not null default 'ZAR',
  status            text not null default 'INGESTED'
                    check (status in ('INGESTED','EXTRACTING','EXTRACTED','RECONCILING','RECONCILED','EXCEPTION','FAILED')),
  extracted_at      timestamptz,
  ingested_at       timestamptz not null default now(),
  ingested_by       text not null
);

-- Individual line items extracted from the statement
create table statement_lines (
  id               uuid primary key default gen_random_uuid(),
  statement_id     uuid not null references supplier_statements(id) on delete cascade,
  line_date        date,
  reference        text,
  description      text,
  debit_amount     numeric(12,2),
  credit_amount    numeric(12,2),
  running_balance  numeric(12,2),
  line_type        text not null default 'UNKNOWN'
                   check (line_type in ('INVOICE','CREDIT_NOTE','PAYMENT','UNKNOWN')),
  sort_order       integer not null default 0
);

-- Match result linking a statement line to a Xero transaction
create table recon_matches (
  id                  uuid primary key default gen_random_uuid(),
  statement_line_id   uuid not null references statement_lines(id) on delete cascade,
  xero_transaction_id text,
  xero_reference      text,
  xero_date           date,
  xero_amount         numeric(12,2),
  match_type          text not null
                      check (match_type in ('EXACT','FUZZY','MANUAL')),
  match_confidence    numeric(3,2),
  variance_amount     numeric(12,2),
  confirmed_by        text,
  confirmed_at        timestamptz,
  matched_at          timestamptz not null default now(),
  constraint recon_matches_unique_line unique(statement_line_id)
);

-- Exceptions: statement lines with no Xero match, or Xero transactions not on statement
create table recon_exceptions (
  id                  uuid primary key default gen_random_uuid(),
  statement_id        uuid not null references supplier_statements(id) on delete cascade,
  statement_line_id   uuid references statement_lines(id),
  exception_type      text not null
                      check (exception_type in ('MISSING_IN_XERO','MISSING_ON_STATEMENT','AMOUNT_MISMATCH','DATE_MISMATCH')),
  xero_transaction_id text,
  xero_reference      text,
  xero_amount         numeric(12,2),
  notes               text,
  resolved_by         text,
  resolved_at         timestamptz,
  resolution          text,
  created_at          timestamptz not null default now()
);

-- Indexes
create index idx_supplier_statements_supplier on supplier_statements(supplier_id);
create index idx_supplier_statements_status on supplier_statements(status);
create index idx_statement_lines_statement on statement_lines(statement_id);
create index idx_recon_matches_line on recon_matches(statement_line_id);
create index idx_recon_exceptions_statement on recon_exceptions(statement_id);

-- RLS policies
alter table supplier_statement_configs enable row level security;
alter table supplier_statements enable row level security;
alter table statement_lines enable row level security;
alter table recon_matches enable row level security;
alter table recon_exceptions enable row level security;

-- Allow authenticated users to read all statement data
create policy "Authenticated users can read statement configs"
  on supplier_statement_configs for select to authenticated using (true);
create policy "Authenticated users can insert statement configs"
  on supplier_statement_configs for insert to authenticated with check (true);
create policy "Authenticated users can update statement configs"
  on supplier_statement_configs for update to authenticated using (true);

create policy "Authenticated users can read statements"
  on supplier_statements for select to authenticated using (true);
create policy "Authenticated users can insert statements"
  on supplier_statements for insert to authenticated with check (true);
create policy "Authenticated users can update statements"
  on supplier_statements for update to authenticated using (true);

create policy "Authenticated users can read statement lines"
  on statement_lines for select to authenticated using (true);
create policy "Authenticated users can insert statement lines"
  on statement_lines for insert to authenticated with check (true);

create policy "Authenticated users can read recon matches"
  on recon_matches for select to authenticated using (true);
create policy "Authenticated users can insert recon matches"
  on recon_matches for insert to authenticated with check (true);
create policy "Authenticated users can update recon matches"
  on recon_matches for update to authenticated using (true);

create policy "Authenticated users can read recon exceptions"
  on recon_exceptions for select to authenticated using (true);
create policy "Authenticated users can insert recon exceptions"
  on recon_exceptions for insert to authenticated with check (true);
create policy "Authenticated users can update recon exceptions"
  on recon_exceptions for update to authenticated using (true);

-- Service role bypasses RLS, so backend extraction/reconciliation works without extra policies
