-- supabase/migrations/003_add_reconciled_at.sql
alter table supplier_statements add column reconciled_at timestamptz;
