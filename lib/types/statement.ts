// lib/types/statement.ts

export type StatementLineType = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'UNKNOWN'
export type StatementStatus = 'INGESTED' | 'EXTRACTING' | 'EXTRACTED' | 'RECONCILING' | 'RECONCILED' | 'EXCEPTION' | 'FAILED'
export type MatchType = 'EXACT' | 'FUZZY' | 'MANUAL'
export type ExceptionType = 'MISSING_IN_XERO' | 'MISSING_ON_STATEMENT' | 'AMOUNT_MISMATCH' | 'DATE_MISMATCH'

export interface SupplierStatementConfig {
  id: string
  supplier_id: string
  trained_by: string
  trained_at: string
  sample_storage_path: string
  date_format: string
  reference_column_hint: string | null
  reference_pattern: string | null
  debit_label: string | null
  credit_label: string | null
  payment_identifier: string | null
  opening_balance_label: string | null
  closing_balance_label: string | null
  layout_notes: string | null
  sample_lines: ExtractedStatementLine[] | null
  is_active: boolean
}

export interface ExtractedStatementLine {
  line_date: string | null
  reference: string | null
  description: string | null
  debit_amount: number | null
  credit_amount: number | null
  running_balance: number | null
  line_type: StatementLineType
}

export interface ExtractedStatement {
  supplier_name: string | null
  supplier_vat: string | null
  statement_date: string | null
  date_from: string | null
  date_to: string | null
  opening_balance: number | null
  closing_balance: number | null
  currency: string
  lines: ExtractedStatementLine[]
  confidence: number
}

export interface ProposedStatementConfig {
  date_format: string
  reference_column_hint: string | null
  reference_pattern: string | null
  debit_label: string | null
  credit_label: string | null
  payment_identifier: string | null
  opening_balance_label: string | null
  closing_balance_label: string | null
  layout_notes: string
  sample_lines: ExtractedStatementLine[]
}

export interface XeroTransaction {
  xero_id: string
  type: 'BILL' | 'CREDIT_NOTE' | 'PAYMENT'
  reference: string | null
  date: string
  amount: number
  status: string
}

export interface ReconMatchResult {
  statement_line_id: string
  xero_transaction_id: string | null
  xero_reference: string | null
  xero_date: string | null
  xero_amount: number | null
  match_type: MatchType
  match_confidence: number
  variance_amount: number
}
