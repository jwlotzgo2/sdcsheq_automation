-- Store Xero transactions snapshot when reconciliation runs
ALTER TABLE supplier_statements ADD COLUMN xero_transactions_json jsonb;
