// lib/recon/reconcile.ts
import { XeroTransaction, ReconMatchResult, ExceptionType, StatementLineType } from '@/lib/types/statement'

interface StatementLineInput {
  id: string
  reference: string | null
  description: string | null
  line_date: string | null
  debit_amount: number | null
  credit_amount: number | null
  line_type: StatementLineType
}

interface ReconException {
  statement_id: string
  statement_line_id: string | null
  exception_type: ExceptionType
  xero_transaction_id: string | null
  xero_reference: string | null
  xero_amount: number | null
  notes: string
}

interface ReconResult {
  matches: ReconMatchResult[]
  exceptions: ReconException[]
}

function normalizeRef(ref: string | null): string {
  if (!ref) return ''
  return ref.trim().toUpperCase().replace(/^(INV|CN|PMT|CR|DBN|DB)[-.\s]*/i, '')
}

function getEffectiveAmount(line: StatementLineInput): number | null {
  if (line.line_type === 'PAYMENT' || line.line_type === 'CREDIT_NOTE') {
    return line.credit_amount
  }
  return line.debit_amount
}

function dateDiffDays(a: string | null, b: string | null): number {
  if (!a || !b) return 999
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.abs(da - db) / (1000 * 60 * 60 * 24)
}

function typeAligns(lineType: StatementLineType, txnType: 'BILL' | 'CREDIT_NOTE' | 'PAYMENT'): boolean {
  if (lineType === 'INVOICE' && txnType === 'BILL') return true
  if (lineType === 'PAYMENT' && txnType === 'PAYMENT') return true
  if (lineType === 'CREDIT_NOTE' && txnType === 'CREDIT_NOTE') return true
  return false
}

export function reconcile(
  lines: StatementLineInput[],
  xeroTxns: XeroTransaction[],
  statementId: string
): ReconResult {
  const matches: ReconMatchResult[] = []
  const exceptions: ReconException[] = []

  const unmatchedLines = new Set(lines.map(l => l.id))
  const unmatchedTxns = new Set(xeroTxns.map(t => t.xero_id))

  // Pass 1: EXACT — reference match + amount within R0.01
  for (const line of lines) {
    if (!unmatchedLines.has(line.id)) continue
    const lineRef = normalizeRef(line.reference)
    const lineAmt = getEffectiveAmount(line)
    if (!lineRef || lineAmt == null) continue

    for (const txn of xeroTxns) {
      if (!unmatchedTxns.has(txn.xero_id)) continue
      const txnRef = normalizeRef(txn.reference)
      if (!txnRef) continue

      if (lineRef === txnRef && Math.abs(lineAmt - txn.amount) < 0.01) {
        matches.push({
          statement_line_id: line.id,
          xero_transaction_id: txn.xero_id,
          xero_reference: txn.reference,
          xero_date: txn.date,
          xero_amount: txn.amount,
          match_type: 'EXACT',
          match_confidence: 1.0,
          variance_amount: Math.round((lineAmt - txn.amount) * 100) / 100,
        })
        unmatchedLines.delete(line.id)
        unmatchedTxns.delete(txn.xero_id)
        break
      }
    }
  }

  // Pass 2: FUZZY — score-based matching
  for (const line of lines) {
    if (!unmatchedLines.has(line.id)) continue
    const lineRef = normalizeRef(line.reference)
    const lineAmt = getEffectiveAmount(line)

    let bestScore = 0
    let bestTxn: XeroTransaction | null = null

    for (const txn of xeroTxns) {
      if (!unmatchedTxns.has(txn.xero_id)) continue
      let score = 0
      const txnRef = normalizeRef(txn.reference)

      if (lineRef && txnRef && (lineRef.includes(txnRef) || txnRef.includes(lineRef))) {
        score += 0.4
      }

      if (lineAmt != null && txn.amount > 0) {
        const diff = Math.abs(lineAmt - txn.amount)
        if (diff / Math.max(Math.abs(lineAmt), 1) < 0.05 || diff < 50) {
          score += 0.3
        }
      }

      if (dateDiffDays(line.line_date, txn.date) <= 7) {
        score += 0.2
      }

      if (typeAligns(line.line_type, txn.type)) {
        score += 0.1
      }

      if (score > bestScore) {
        bestScore = score
        bestTxn = txn
      }
    }

    if (bestScore >= 0.5 && bestTxn) {
      matches.push({
        statement_line_id: line.id,
        xero_transaction_id: bestTxn.xero_id,
        xero_reference: bestTxn.reference,
        xero_date: bestTxn.date,
        xero_amount: bestTxn.amount,
        match_type: 'FUZZY',
        match_confidence: Math.round(bestScore * 100) / 100,
        variance_amount: lineAmt != null
          ? Math.round((lineAmt - bestTxn.amount) * 100) / 100
          : 0,
      })
      unmatchedLines.delete(line.id)
      unmatchedTxns.delete(bestTxn.xero_id)
    }
  }

  // Pass 3: Exceptions
  for (const lineId of unmatchedLines) {
    const line = lines.find(l => l.id === lineId)!
    const amt = getEffectiveAmount(line)
    exceptions.push({
      statement_id: statementId,
      statement_line_id: line.id,
      exception_type: 'MISSING_IN_XERO',
      xero_transaction_id: null,
      xero_reference: null,
      xero_amount: null,
      notes: `Statement line ${line.reference || 'no ref'} (${amt != null ? `R${amt.toFixed(2)}` : 'no amount'}) has no matching Xero transaction`,
    })
  }

  for (const txnId of unmatchedTxns) {
    const txn = xeroTxns.find(t => t.xero_id === txnId)!
    exceptions.push({
      statement_id: statementId,
      statement_line_id: null,
      exception_type: 'MISSING_ON_STATEMENT',
      xero_transaction_id: txn.xero_id,
      xero_reference: txn.reference,
      xero_amount: txn.amount,
      notes: `Xero ${txn.type} ${txn.reference || 'no ref'} (R${txn.amount.toFixed(2)}) not found on statement`,
    })
  }

  return { matches, exceptions }
}
