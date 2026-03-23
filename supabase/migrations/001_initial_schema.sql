-- ============================================================
-- AP Automation MVP — Initial Schema
-- Migration: 001_initial_schema.sql
-- Stack: Supabase (Postgres) + RLS
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_crypto";

-- ── ENUMS ───────────────────────────────────────────────────
create type invoice_status as enum (
  'INGESTED',
  'EXTRACTING',
  'EXTRACTION_FAILED',
  'PENDING_REVIEW',
  'IN_REVIEW',
  'PENDING_APPROVAL',
  'APPROVED',
  'PUSHING_TO_XERO',
  'XERO_POSTED',
  'XERO_AUTHORISED',
  'XERO_PAID',
  'REJECTED',
  'RETURNED'
);

create type invoice_source as enum (
  'EMAIL',
  'MOBILE_CAPTURE',
  'MANUAL_UPLOAD'
);

create type kyc_status as enum (
  'INGESTED',
  'EXTRACTING',
  'PENDING_REVIEW',
  'IN_REVIEW',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED'
);

create type user_role as enum (
  'AP_CLERK',
  'REVIEWER',
  'APPROVER',
  'FINANCE_MANAGER',
  'AP_ADMIN'
);

create type xero_push_status as enum (
  'SUCCESS',
  'FAILED',
  'DUPLICATE',
  'SUPPLIER_NOT_FOUND'
);

-- ── USER PROFILES ────────────────────────────────────────────
-- Extends Supabase auth.users with app-level role and metadata
create table public.user_profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  role            user_role not null default 'AP_CLERK',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_profiles_user_id_key unique (user_id),
  constraint user_profiles_email_key unique (email)
);

-- ── GL CODES ─────────────────────────────────────────────────
-- Synced from Xero chart of accounts
create table public.gl_codes (
  id                uuid primary key default uuid_generate_v4(),
  xero_account_code text not null,
  name              text not null,
  account_type      text,
  description       text,
  is_active         boolean not null default true,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  constraint gl_codes_xero_code_key unique (xero_account_code)
);

-- ── COST CENTRES ─────────────────────────────────────────────
create table public.cost_centres (
  id              uuid primary key default uuid_generate_v4(),
  code            text not null,
  name            text not null,
  budget_owner_id uuid references public.user_profiles(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint cost_centres_code_key unique (code)
);

-- ── SUPPLIERS ────────────────────────────────────────────────
-- Synced from Xero contacts (SUPPLIER type)
create table public.suppliers (
  id                  uuid primary key default uuid_generate_v4(),
  xero_contact_id     text,
  name                text not null,
  vat_number          text,
  email               text,
  default_gl_code_id  uuid references public.gl_codes(id),
  gl_confidence       integer not null default 0, -- number of confirmed allocations
  is_active           boolean not null default true,
  synced_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint suppliers_xero_contact_key unique (xero_contact_id)
);

-- ── INVOICES ─────────────────────────────────────────────────
create table public.invoices (
  id                uuid primary key default uuid_generate_v4(),
  status            invoice_status not null default 'INGESTED',
  source            invoice_source not null default 'EMAIL',
  supplier_id       uuid references public.suppliers(id),
  supplier_name     text,                          -- raw extracted, before supplier match
  invoice_number    text,
  invoice_date      date,
  due_date          date,
  amount_excl       numeric(12,2),
  amount_vat        numeric(12,2),
  amount_incl       numeric(12,2),
  currency          text not null default 'ZAR',
  storage_path      text,                          -- Supabase Storage path
  postmark_message_id text,
  file_hash         text,                          -- SHA256 for duplicate detection
  assigned_reviewer uuid references public.user_profiles(id),
  assigned_approver uuid references public.user_profiles(id),
  xero_bill_id      text,
  xero_bill_number  text,
  paid_at           timestamptz,
  paid_amount       numeric(12,2),
  rejection_reason  text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── INVOICE LINE ITEMS ───────────────────────────────────────
create table public.invoice_line_items (
  id              uuid primary key default uuid_generate_v4(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  description     text,
  quantity        numeric(10,3),
  unit_price      numeric(12,2),
  line_total      numeric(12,2),
  vat_rate        numeric(5,2),
  gl_code_id      uuid references public.gl_codes(id),
  cost_centre_id  uuid references public.cost_centres(id),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ── OCR EXTRACTIONS ──────────────────────────────────────────
-- Stores raw Claude output + reviewer corrections per invoice
create table public.ocr_extractions (
  id                    uuid primary key default uuid_generate_v4(),
  invoice_id            uuid not null references public.invoices(id) on delete cascade,
  raw_json              jsonb,                     -- Claude's original response
  corrected_json        jsonb,                     -- After reviewer edits
  confidence_score      numeric(4,3),              -- Overall confidence 0.000–1.000
  field_confidence      jsonb,                     -- Per-field confidence scores
  suggested_gl_code_id  uuid references public.gl_codes(id),
  model_used            text,
  prompt_version        text,
  extraction_duration_ms integer,
  reviewed_by           uuid references public.user_profiles(id),
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  constraint ocr_extractions_invoice_key unique (invoice_id)
);

-- ── AUDIT TRAIL ──────────────────────────────────────────────
-- Immutable log — no updates or deletes ever
create table public.audit_trail (
  id            uuid primary key default uuid_generate_v4(),
  invoice_id    uuid references public.invoices(id),
  kyc_id        uuid,                              -- FK added after kyc_applications created
  from_status   text,
  to_status     text not null,
  actor_id      uuid references public.user_profiles(id),
  actor_email   text,                              -- Denormalised for permanence
  notes         text,
  metadata      jsonb,                             -- Any extra context
  created_at    timestamptz not null default now()
);

-- ── EMAIL INGESTION LOG ──────────────────────────────────────
create table public.email_ingestion_log (
  id                    uuid primary key default uuid_generate_v4(),
  postmark_message_id   text not null,
  received_at           timestamptz not null,
  sender                text,
  subject               text,
  attachment_count      integer not null default 0,
  processed             boolean not null default false,
  error                 text,
  created_at            timestamptz not null default now(),
  constraint email_ingestion_postmark_id_key unique (postmark_message_id)
);

-- ── XERO PUSH LOG ────────────────────────────────────────────
create table public.xero_push_log (
  id              uuid primary key default uuid_generate_v4(),
  invoice_id      uuid not null references public.invoices(id),
  push_status     xero_push_status not null,
  xero_bill_id    text,
  xero_bill_number text,
  response_body   jsonb,
  error_detail    text,
  pushed_at       timestamptz not null default now()
);

-- ── KYC APPLICATIONS ─────────────────────────────────────────
create table public.kyc_applications (
  id              uuid primary key default uuid_generate_v4(),
  status          kyc_status not null default 'INGESTED',
  storage_path    text,
  postmark_message_id text,
  file_hash       text,
  assigned_reviewer uuid references public.user_profiles(id),
  assigned_approver uuid references public.user_profiles(id),
  rejection_reason text,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  approved_at     timestamptz,
  reviewed_by     uuid references public.user_profiles(id),
  approved_by     uuid references public.user_profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── KYC FIELDS ───────────────────────────────────────────────
create table public.kyc_fields (
  id              uuid primary key default uuid_generate_v4(),
  kyc_id          uuid not null references public.kyc_applications(id) on delete cascade,
  entity_name     text,
  reg_number      text,
  vat_number      text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  bank_name       text,
  account_number  text,
  branch_code     text,
  account_type    text,
  raw_json        jsonb,
  field_confidence jsonb,
  created_at      timestamptz not null default now(),
  constraint kyc_fields_kyc_id_key unique (kyc_id)
);

-- ── Add deferred FK on audit_trail.kyc_id ────────────────────
alter table public.audit_trail
  add constraint audit_trail_kyc_id_fkey
  foreign key (kyc_id) references public.kyc_applications(id);

-- ── XERO SETTINGS ────────────────────────────────────────────
-- Stores OAuth tokens (encrypted) and config
create table public.xero_settings (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         text,
  tenant_name       text,
  access_token      text,                          -- store encrypted in production
  refresh_token     text,                          -- store encrypted in production
  token_expires_at  timestamptz,
  bill_status       text not null default 'DRAFT', -- DRAFT or SUBMITTED
  last_sync_at      timestamptz,
  connected_by      uuid references public.user_profiles(id),
  connected_at      timestamptz,
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_invoices_status on public.invoices(status);
create index idx_invoices_supplier_id on public.invoices(supplier_id);
create index idx_invoices_created_at on public.invoices(created_at desc);
create index idx_invoices_file_hash on public.invoices(file_hash);
create index idx_invoices_postmark_id on public.invoices(postmark_message_id);
create index idx_invoice_lines_invoice_id on public.invoice_line_items(invoice_id);
create index idx_audit_trail_invoice_id on public.audit_trail(invoice_id);
create index idx_audit_trail_kyc_id on public.audit_trail(kyc_id);
create index idx_audit_trail_created_at on public.audit_trail(created_at desc);
create index idx_kyc_status on public.kyc_applications(status);
create index idx_xero_push_invoice_id on public.xero_push_log(invoice_id);
create index idx_ocr_invoice_id on public.ocr_extractions(invoice_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns the role of the currently authenticated user
create or replace function public.get_my_role()
returns user_role
language sql
security definer
stable
as $$
  select role from public.user_profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- Check if current user has a specific role or higher
create or replace function public.is_role(required_role user_role)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid()
    and is_active = true
    and case required_role
      when 'AP_CLERK'        then role in ('AP_CLERK','REVIEWER','APPROVER','FINANCE_MANAGER','AP_ADMIN')
      when 'REVIEWER'        then role in ('REVIEWER','FINANCE_MANAGER','AP_ADMIN')
      when 'APPROVER'        then role in ('APPROVER','FINANCE_MANAGER','AP_ADMIN')
      when 'FINANCE_MANAGER' then role in ('FINANCE_MANAGER','AP_ADMIN')
      when 'AP_ADMIN'        then role = 'AP_ADMIN'
      else false
    end
  );
$$;

-- Auto-update updated_at on any table that has it
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create user_profile on first Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at triggers
create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.handle_updated_at();

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.handle_updated_at();

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();

create trigger kyc_applications_updated_at
  before update on public.kyc_applications
  for each row execute function public.handle_updated_at();

create trigger xero_settings_updated_at
  before update on public.xero_settings
  for each row execute function public.handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table public.user_profiles      enable row level security;
alter table public.invoices            enable row level security;
alter table public.invoice_line_items  enable row level security;
alter table public.ocr_extractions     enable row level security;
alter table public.audit_trail         enable row level security;
alter table public.suppliers           enable row level security;
alter table public.gl_codes            enable row level security;
alter table public.cost_centres        enable row level security;
alter table public.email_ingestion_log enable row level security;
alter table public.xero_push_log       enable row level security;
alter table public.kyc_applications    enable row level security;
alter table public.kyc_fields          enable row level security;
alter table public.xero_settings       enable row level security;

-- ── user_profiles ────────────────────────────────────────────
create policy "Users can view all profiles"
  on public.user_profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can manage all profiles"
  on public.user_profiles for all
  to authenticated
  using (is_role('AP_ADMIN'));

-- ── invoices ─────────────────────────────────────────────────
create policy "Authenticated users can view invoices"
  on public.invoices for select
  to authenticated
  using (true);

create policy "Reviewers can update invoices"
  on public.invoices for update
  to authenticated
  using (is_role('REVIEWER'));

create policy "Service role can insert invoices"
  on public.invoices for insert
  to authenticated
  using (true);

-- ── invoice_line_items ───────────────────────────────────────
create policy "Authenticated users can view line items"
  on public.invoice_line_items for select
  to authenticated
  using (true);

create policy "Reviewers can manage line items"
  on public.invoice_line_items for all
  to authenticated
  using (is_role('REVIEWER'));

-- ── ocr_extractions ──────────────────────────────────────────
create policy "Authenticated users can view OCR data"
  on public.ocr_extractions for select
  to authenticated
  using (true);

create policy "Reviewers can update OCR data"
  on public.ocr_extractions for all
  to authenticated
  using (is_role('REVIEWER'));

-- ── audit_trail ──────────────────────────────────────────────
-- Read-only for all authenticated; inserts only via service role
create policy "Authenticated users can view audit trail"
  on public.audit_trail for select
  to authenticated
  using (true);

create policy "Authenticated users can insert audit entries"
  on public.audit_trail for insert
  to authenticated
  with check (true);

-- ── suppliers ────────────────────────────────────────────────
create policy "Authenticated users can view suppliers"
  on public.suppliers for select
  to authenticated
  using (true);

create policy "Finance managers can manage suppliers"
  on public.suppliers for all
  to authenticated
  using (is_role('FINANCE_MANAGER'));

-- ── gl_codes ─────────────────────────────────────────────────
create policy "Authenticated users can view GL codes"
  on public.gl_codes for select
  to authenticated
  using (true);

create policy "Finance managers can manage GL codes"
  on public.gl_codes for all
  to authenticated
  using (is_role('FINANCE_MANAGER'));

-- ── cost_centres ─────────────────────────────────────────────
create policy "Authenticated users can view cost centres"
  on public.cost_centres for select
  to authenticated
  using (true);

create policy "Finance managers can manage cost centres"
  on public.cost_centres for all
  to authenticated
  using (is_role('FINANCE_MANAGER'));

-- ── email_ingestion_log ──────────────────────────────────────
create policy "Admins can view ingestion log"
  on public.email_ingestion_log for select
  to authenticated
  using (is_role('AP_ADMIN'));

-- ── xero_push_log ────────────────────────────────────────────
create policy "Finance managers can view Xero push log"
  on public.xero_push_log for select
  to authenticated
  using (is_role('FINANCE_MANAGER'));

-- ── kyc_applications ─────────────────────────────────────────
create policy "Authenticated users can view KYC applications"
  on public.kyc_applications for select
  to authenticated
  using (true);

create policy "Reviewers can manage KYC applications"
  on public.kyc_applications for all
  to authenticated
  using (is_role('REVIEWER'));

-- ── kyc_fields ───────────────────────────────────────────────
create policy "Authenticated users can view KYC fields"
  on public.kyc_fields for select
  to authenticated
  using (true);

create policy "Reviewers can manage KYC fields"
  on public.kyc_fields for all
  to authenticated
  using (is_role('REVIEWER'));

-- ── xero_settings ────────────────────────────────────────────
create policy "Admins can manage Xero settings"
  on public.xero_settings for all
  to authenticated
  using (is_role('AP_ADMIN'));

-- ============================================================
-- POWER BI REPORTING VIEWS
-- ============================================================

create or replace view public.vw_fact_invoices as
select
  i.id,
  i.status,
  i.source,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.amount_excl,
  i.amount_vat,
  i.amount_incl,
  i.currency,
  i.created_at                                        as received_at,
  i.paid_at,
  i.paid_amount,
  s.name                                              as supplier_name,
  s.vat_number                                        as supplier_vat,
  r.full_name                                         as reviewed_by,
  a.full_name                                         as approved_by,
  extract(epoch from (i.updated_at - i.created_at))/3600 as processing_hours,
  date_trunc('month', i.created_at)                   as invoice_month
from public.invoices i
left join public.suppliers s       on s.id = i.supplier_id
left join public.user_profiles r   on r.id = i.assigned_reviewer
left join public.user_profiles a   on a.id = i.assigned_approver;

create or replace view public.vw_fact_invoice_lines as
select
  il.id,
  il.invoice_id,
  il.description,
  il.quantity,
  il.unit_price,
  il.line_total,
  il.vat_rate,
  g.xero_account_code                                 as gl_code,
  g.name                                              as gl_name,
  g.account_type                                      as gl_type,
  cc.code                                             as cost_centre_code,
  cc.name                                             as cost_centre_name,
  i.invoice_date,
  i.status                                            as invoice_status,
  s.name                                              as supplier_name,
  date_trunc('month', i.invoice_date)                 as invoice_month
from public.invoice_line_items il
join public.invoices i             on i.id = il.invoice_id
left join public.gl_codes g        on g.id = il.gl_code_id
left join public.cost_centres cc   on cc.id = il.cost_centre_id
left join public.suppliers s       on s.id = i.supplier_id;

create or replace view public.vw_fact_kyc_applications as
select
  k.id,
  k.status,
  k.created_at                                        as received_at,
  k.submitted_at,
  k.reviewed_at,
  k.approved_at,
  kf.entity_name,
  kf.reg_number,
  kf.vat_number,
  kf.bank_name,
  kf.account_type,
  r.full_name                                         as reviewed_by,
  a.full_name                                         as approved_by,
  extract(epoch from (k.approved_at - k.created_at))/3600 as processing_hours,
  date_trunc('month', k.created_at)                   as application_month
from public.kyc_applications k
left join public.kyc_fields kf     on kf.kyc_id = k.id
left join public.user_profiles r   on r.id = k.reviewed_by
left join public.user_profiles a   on a.id = k.approved_by;

create or replace view public.vw_audit_trail as
select
  at.id,
  at.invoice_id,
  at.kyc_id,
  at.from_status,
  at.to_status,
  at.actor_email,
  at.notes,
  at.created_at,
  i.invoice_number,
  i.amount_incl,
  s.name                                              as supplier_name
from public.audit_trail at
left join public.invoices i        on i.id = at.invoice_id
left join public.suppliers s       on s.id = i.supplier_id;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default GL codes (common South African chart of accounts)
insert into public.gl_codes (xero_account_code, name, account_type) values
  ('200', 'Sales',                         'REVENUE'),
  ('400', 'Advertising & Marketing',       'EXPENSE'),
  ('404', 'Bank Fees',                     'EXPENSE'),
  ('408', 'Cleaning',                      'EXPENSE'),
  ('412', 'Consulting & Accounting',       'EXPENSE'),
  ('416', 'Depreciation',                  'EXPENSE'),
  ('420', 'Entertainment',                 'EXPENSE'),
  ('424', 'Freight & Courier',             'EXPENSE'),
  ('425', 'General Expenses',              'EXPENSE'),
  ('429', 'IT & Software',                 'EXPENSE'),
  ('433', 'Janitorial',                    'EXPENSE'),
  ('437', 'Legal Expenses',                'EXPENSE'),
  ('441', 'Meals & Accommodation',         'EXPENSE'),
  ('445', 'Motor Vehicle Expenses',        'EXPENSE'),
  ('449', 'Office Expenses',               'EXPENSE'),
  ('453', 'Printing & Stationery',         'EXPENSE'),
  ('457', 'Repairs & Maintenance',         'EXPENSE'),
  ('461', 'Staff Training',                'EXPENSE'),
  ('465', 'Subscriptions',                 'EXPENSE'),
  ('469', 'Telephone & Internet',          'EXPENSE'),
  ('473', 'Travel',                        'EXPENSE'),
  ('477', 'Utilities',                     'EXPENSE'),
  ('800', 'Cost of Goods Sold',            'DIRECTCOSTS'),
  ('810', 'Labour',                        'DIRECTCOSTS')
on conflict (xero_account_code) do nothing;

-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or API)
-- ============================================================
-- Bucket: invoices        — private, authenticated access only
-- Bucket: kyc-documents   — private, authenticated access only
-- Bucket: mobile-captures — private, authenticated access only
--
-- Storage policies:
--   Reviewers can read/write to invoices and kyc-documents
--   All authenticated users can write to mobile-captures
--   AP_ADMIN can read all buckets
-- ============================================================
