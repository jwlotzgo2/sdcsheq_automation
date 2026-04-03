// app/statements/[id]/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#DC2626'
const BLUE   = '#3B82F6'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  INGESTED:    { bg: '#F3F4F6', text: '#374151' },
  EXTRACTING:  { bg: '#FEF3C7', text: '#92400E' },
  EXTRACTED:   { bg: '#DBEAFE', text: '#1E40AF' },
  RECONCILING: { bg: '#FEF3C7', text: '#92400E' },
  RECONCILED:  { bg: '#D1FAE5', text: '#065F46' },
  EXCEPTION:   { bg: '#FEE2E2', text: '#991B1B' },
  FAILED:      { bg: '#FEE2E2', text: '#991B1B' },
}

const MATCH_COLORS: Record<string, { bg: string; text: string }> = {
  EXACT:  { bg: '#D1FAE5', text: '#065F46' },
  FUZZY:  { bg: '#DBEAFE', text: '#1E40AF' },
  MANUAL: { bg: '#FEF3C7', text: '#92400E' },
}

const XERO_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  BILL:        { bg: '#FEF3C7', text: '#92400E' },
  PAYMENT:     { bg: '#D1FAE5', text: '#065F46' },
  CREDIT_NOTE: { bg: '#DBEAFE', text: '#1E40AF' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

interface ReconMatch {
  id: string
  match_type: string
  match_confidence: number | null
  xero_reference: string | null
  xero_date: string | null
  xero_amount: number | null
  variance_amount: number | null
}

interface StatementLine {
  id: string
  statement_id: string
  line_date: string | null
  reference: string | null
  description: string | null
  debit_amount: number | null
  credit_amount: number | null
  line_type: string | null
  sort_order: number
  recon_matches: ReconMatch[]
}

interface ReconException {
  id: string
  statement_id: string
  statement_line_id: string | null
  exception_type: string
  xero_transaction_id: string | null
  xero_reference: string | null
  xero_amount: number | null
  notes: string | null
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

interface XeroTransaction {
  xero_id: string
  type: 'BILL' | 'CREDIT_NOTE' | 'PAYMENT'
  reference: string | null
  date: string
  amount: number
  status: string
}

interface Statement {
  id: string
  supplier_id: string
  status: string
  statement_date: string | null
  date_from: string | null
  date_to: string | null
  opening_balance: number | null
  closing_balance: number | null
  currency: string | null
  storage_path: string
  xero_transactions_json: XeroTransaction[] | null
  suppliers: { name: string; xero_contact_id: string | null } | null
}

export default function StatementDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [statement, setStatement] = useState<Statement | null>(null)
  const [lines, setLines] = useState<StatementLine[]>([])
  const [exceptions, setExceptions] = useState<ReconException[]>([])
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    try {
      const { data: stmt, error: stmtErr } = await supabase
        .from('supplier_statements')
        .select('*, suppliers(name, xero_contact_id)')
        .eq('id', id)
        .single()

      if (stmtErr || !stmt) throw new Error(stmtErr?.message || 'Statement not found')

      const [{ data: lineData }, { data: excData }, { data: urlData }] = await Promise.all([
        supabase
          .from('statement_lines')
          .select('*, recon_matches(*)')
          .eq('statement_id', id)
          .order('sort_order'),
        supabase
          .from('recon_exceptions')
          .select('*')
          .eq('statement_id', id)
          .order('created_at'),
        supabase.storage
          .from('invoices')
          .createSignedUrl(stmt.storage_path, 3600),
      ])

      setStatement(stmt as Statement)
      // PostgREST may return recon_matches as object (unique constraint) or array — normalize
      const normalizedLines = (lineData || []).map((line: any) => ({
        ...line,
        recon_matches: line.recon_matches
          ? Array.isArray(line.recon_matches) ? line.recon_matches : [line.recon_matches]
          : [],
      }))
      setLines(normalizedLines as StatementLine[])
      setExceptions((excData as ReconException[]) || [])
      setPdfUrl(urlData?.signedUrl || null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load statement')
    } finally {
      setLoading(false)
    }
  }, [id, supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleReconcile = async () => {
    if (!id) return
    setReconciling(true)
    setError(null)
    try {
      const res = await fetch(`/api/recon/${id}/run`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Reconciliation failed')
      }
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed')
    } finally {
      setReconciling(false)
    }
  }

  const handleResolveException = async (exceptionId: string) => {
    if (!resolution.trim()) return
    try {
      const res = await fetch(`/api/recon/${id}/resolve-exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exception_id: exceptionId, resolution: resolution.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to resolve exception')
      }
      setResolvingId(null)
      setResolution('')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve exception')
    }
  }

  // Computed values
  const matchedLines = lines.filter(l => l.recon_matches && l.recon_matches.length > 0)
  const matchedCount = matchedLines.length
  const unresolvedExceptions = exceptions.filter(e => !e.resolved_at)

  const xeroTxns: XeroTransaction[] = statement?.xero_transactions_json || []
  const xeroBills = xeroTxns.filter(t => t.type === 'BILL').reduce((s, t) => s + (t.amount || 0), 0)
  const xeroPayments = xeroTxns.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + (t.amount || 0), 0)
  const xeroCN = xeroTxns.filter(t => t.type === 'CREDIT_NOTE').reduce((s, t) => s + (t.amount || 0), 0)
  const ourBalance = xeroBills - xeroPayments - xeroCN
  const supplierBalance = statement?.closing_balance || 0
  const difference = supplierBalance - ourBalance

  const statusColors = statement ? (STATUS_COLORS[statement.status] || STATUS_COLORS.INGESTED) : STATUS_COLORS.INGESTED
  const canReconcile = statement && (statement.status === 'EXTRACTED' || statement.status === 'EXCEPTION')
  const hasXero = statement?.suppliers?.xero_contact_id

  // Exception groups
  const missingInXero = exceptions.filter(e => e.exception_type === 'MISSING_IN_XERO')
  const missingOnStatement = exceptions.filter(e => e.exception_type === 'MISSING_ON_STATEMENT')
  const otherExceptions = exceptions.filter(e => e.exception_type !== 'MISSING_IN_XERO' && e.exception_type !== 'MISSING_ON_STATEMENT')

  // Shared styles
  const cardStyle: React.CSSProperties = {
    backgroundColor: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '20px',
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    color: MUTED,
    fontWeight: '600',
    fontSize: '11px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderBottom: `2px solid ${BORDER}`,
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    color: DARK,
    fontSize: '13px',
    borderBottom: `1px solid ${BORDER}`,
  }

  // Resolve UI for an exception
  const renderResolveUI = (exc: ReconException) => {
    const isResolved = !!exc.resolved_at
    const isResolving = resolvingId === exc.id

    if (isResolved) {
      return (
        <span style={{ fontSize: '12px', color: MUTED }}>Resolved: {exc.resolution}</span>
      )
    }

    if (isResolving) {
      return (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            placeholder="Enter resolution notes..."
            style={{
              flex: 1,
              padding: '7px 10px',
              border: `1px solid ${BORDER}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: DARK,
              outline: 'none',
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleResolveException(exc.id) }}
            autoFocus
          />
          <button
            onClick={() => handleResolveException(exc.id)}
            disabled={!resolution.trim()}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: resolution.trim() ? AMBER : '#C8B89A',
              color: WHITE,
              fontSize: '13px',
              fontWeight: '700',
              cursor: resolution.trim() ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            Submit
          </button>
          <button
            onClick={() => { setResolvingId(null); setResolution('') }}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: `1px solid ${BORDER}`,
              backgroundColor: WHITE,
              color: MUTED,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )
    }

    return (
      <button
        onClick={() => { setResolvingId(exc.id); setResolution('') }}
        style={{
          padding: '5px 12px',
          borderRadius: '6px',
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          color: DARK,
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Resolve
      </button>
    )
  }

  // Render an exception group card
  const renderExceptionGroup = (
    title: string,
    instruction: string,
    borderColor: string,
    items: ReconException[],
  ) => {
    if (items.length === 0) return null

    return (
      <div
        style={{
          ...cardStyle,
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: '0 10px 10px 0',
        }}
      >
        <h3 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 6px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 14px', lineHeight: '1.5' }}>
          {instruction}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(exc => {
            const isResolved = !!exc.resolved_at
            // For MISSING_IN_XERO, look up the statement line
            const excLine = exc.statement_line_id
              ? lines.find(l => l.id === exc.statement_line_id)
              : null

            const ref = exc.exception_type === 'MISSING_IN_XERO'
              ? (excLine?.reference || exc.xero_reference || '—')
              : (exc.xero_reference || '—')
            const desc = exc.exception_type === 'MISSING_IN_XERO'
              ? (excLine?.description || exc.notes || '')
              : (exc.notes || '')
            const amount = exc.exception_type === 'MISSING_IN_XERO'
              ? (excLine ? (excLine.debit_amount || excLine.credit_amount) : exc.xero_amount)
              : exc.xero_amount

            return (
              <div
                key={exc.id}
                style={{
                  padding: '10px 14px',
                  backgroundColor: isResolved ? LIGHT : WHITE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'baseline',
                      textDecoration: isResolved ? 'line-through' : 'none',
                      color: isResolved ? MUTED : DARK,
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>{ref}</span>
                      {desc && <span style={{ fontSize: '12px', color: MUTED }}>{desc}</span>}
                      <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                        {fmt(amount)}
                      </span>
                    </div>
                    {isResolved && exc.resolution && (
                      <div style={{ marginTop: '4px' }}>
                        {renderResolveUI(exc)}
                      </div>
                    )}
                    {!isResolved && resolvingId === exc.id && (
                      <div>{renderResolveUI(exc)}</div>
                    )}
                  </div>
                  {!isResolved && resolvingId !== exc.id && (
                    <div style={{ flexShrink: 0 }}>
                      {renderResolveUI(exc)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <AppShell>
        <div style={{ padding: '28px 32px', color: MUTED, fontSize: '14px' }}>Loading...</div>
      </AppShell>
    )
  }

  if (error && !statement) {
    return (
      <AppShell>
        <div style={{ padding: '28px 32px' }}>
          <p style={{ color: RED, fontSize: '14px' }}>{error}</p>
          <Link href="/statements" style={{ color: AMBER, fontSize: '13px', fontWeight: '600' }}>
            ← Back to Statements
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div style={{ padding: '28px 32px', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>

        {/* Two-column layout: left=content, right=PDF */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '24px',
          flex: 1,
          minHeight: 0,
        }}>

          {/* Left column — scrollable content */}
          <div style={{ overflowY: 'auto', paddingRight: '4px' }}>

            {/* 1. Header */}
            <div style={{ marginBottom: '20px' }}>
              <Link
                href="/statements"
                style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}
              >
                ← Back to Statements
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '22px', fontWeight: '700', color: DARK, margin: 0 }}>
                  {statement?.suppliers?.name || '—'}
                </h1>
                {statement && (
                  <span style={{
                    display: 'inline-block', padding: '3px 8px', borderRadius: '4px',
                    fontSize: '11px', fontWeight: '700',
                    backgroundColor: statusColors.bg, color: statusColors.text,
                  }}>
                    {statement.status}
                  </span>
                )}
                {statement?.statement_date && (
                  <span style={{ fontSize: '13px', color: MUTED }}>{fmtDate(statement.statement_date)}</span>
                )}
              </div>
            </div>

            {error && (
              <p style={{ color: RED, fontSize: '13px', marginBottom: '16px' }}>{error}</p>
            )}

            {/* 2. Balance Comparison Card */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Supplier Says
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: DARK }}>
                    {fmt(supplierBalance)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Xero Says
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: DARK }}>
                    {xeroTxns.length > 0 ? fmt(ourBalance) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Difference
                  </div>
                  <div style={{
                    fontSize: '24px', fontWeight: '700',
                    color: xeroTxns.length > 0 ? (difference === 0 ? '#065F46' : RED) : MUTED,
                  }}>
                    {xeroTxns.length > 0 ? fmt(Math.abs(difference)) : '—'}
                  </div>
                </div>
              </div>

              {/* Stats line */}
              <div style={{
                fontSize: '12px', color: MUTED,
                borderTop: `1px solid ${BORDER}`, paddingTop: '12px', marginTop: '14px',
                display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px',
              }}>
                <span>
                  <strong style={{ color: DARK }}>{matchedCount}</strong> of <strong style={{ color: DARK }}>{lines.length}</strong> lines matched
                  {unresolvedExceptions.length > 0 && (
                    <> | <strong style={{ color: RED }}>{unresolvedExceptions.length}</strong> {unresolvedExceptions.length === 1 ? 'exception' : 'exceptions'}</>
                  )}
                </span>
                {statement?.date_from && statement?.date_to && (
                  <span>{fmtDate(statement.date_from)} — {fmtDate(statement.date_to)}</span>
                )}
              </div>
            </div>

            {/* 3. Run Reconciliation Button */}
            {statement && canReconcile && (
              <div style={{ marginBottom: '20px' }}>
                {hasXero ? (
                  <button
                    onClick={handleReconcile}
                    disabled={reconciling}
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: reconciling ? '#C8B89A' : AMBER,
                      color: WHITE,
                      fontSize: '14px',
                      fontWeight: '700',
                      cursor: reconciling ? 'default' : 'pointer',
                    }}
                  >
                    {reconciling ? 'Reconciling...' : 'Run Reconciliation'}
                  </button>
                ) : (
                  <div>
                    <button
                      disabled
                      style={{
                        width: '100%',
                        padding: '11px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#C8B89A',
                        color: WHITE,
                        fontSize: '14px',
                        fontWeight: '700',
                        cursor: 'not-allowed',
                      }}
                    >
                      Run Reconciliation
                    </button>
                    <p style={{ fontSize: '11px', color: MUTED, marginTop: '4px', textAlign: 'center' }}>
                      Supplier not linked to Xero
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 4. Exceptions Section */}
            {exceptions.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                {renderExceptionGroup(
                  `Request from Supplier (${missingInXero.length})`,
                  "These items appear on the supplier's statement but we can't find them in Xero. Request the original invoices or documents from the supplier.",
                  AMBER,
                  missingInXero,
                )}
                {renderExceptionGroup(
                  `Send to Supplier (${missingOnStatement.length})`,
                  "These transactions are in our Xero records but don't appear on the supplier's statement. Send these documents to the supplier for their records.",
                  BLUE,
                  missingOnStatement,
                )}
                {otherExceptions.length > 0 && renderExceptionGroup(
                  `Other Exceptions (${otherExceptions.length})`,
                  'These exceptions require manual review to resolve discrepancies between statement and Xero records.',
                  MUTED,
                  otherExceptions,
                )}
              </div>
            )}

            {/* 5. Matched Lines Table */}
            {matchedLines.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: DARK, marginBottom: '12px' }}>
                  Matched Lines ({matchedCount})
                </h2>
                <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: LIGHT }}>
                          {['Date', 'Statement Ref', 'Description', 'Statement Amount', 'Match', 'Xero Ref', 'Xero Amount', 'Variance'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matchedLines.map(line => {
                          const match = line.recon_matches[0]
                          const stmtAmount = line.debit_amount != null ? line.debit_amount : line.credit_amount
                          const colors = MATCH_COLORS[match.match_type] || MATCH_COLORS.MANUAL

                          let matchLabel = match.match_type
                          if (match.match_type === 'FUZZY' && match.match_confidence != null) {
                            matchLabel = `FUZZY ${Math.round(match.match_confidence * 100)}%`
                          }

                          const variance = match.variance_amount
                          const varianceColor = variance != null && variance !== 0 ? RED : '#065F46'

                          return (
                            <tr key={line.id}>
                              <td style={tdStyle}>{fmtDate(line.line_date)}</td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{line.reference || '—'}</td>
                              <td style={{ ...tdStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {line.description || '—'}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(stmtAmount)}</td>
                              <td style={tdStyle}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                                  fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap',
                                  backgroundColor: colors.bg, color: colors.text,
                                }}>
                                  {matchLabel}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{match.xero_reference || '—'}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(match.xero_amount)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', color: varianceColor, fontWeight: '600' }}>
                                {fmt(variance)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Xero Transactions Table */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: DARK, margin: '0 0 2px' }}>
                  Xero Transactions ({xeroTxns.length})
                </h2>
                <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>
                  All bills, payments, and credit notes from Xero for this period
                </p>
              </div>
              {xeroTxns.length === 0 ? (
                <div style={{
                  ...cardStyle,
                  textAlign: 'center',
                  color: MUTED,
                  fontSize: '13px',
                  padding: '28px 24px',
                }}>
                  Run reconciliation to fetch Xero data
                </div>
              ) : (
                <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: LIGHT }}>
                          {['Date', 'Reference', 'Type', 'Amount', 'Status'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xeroTxns.map((txn, i) => {
                          const typeColors = XERO_TYPE_COLORS[txn.type] || { bg: '#F3F4F6', text: '#374151' }
                          return (
                            <tr key={txn.xero_id || i}>
                              <td style={tdStyle}>{fmtDate(txn.date)}</td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{txn.reference || '—'}</td>
                              <td style={tdStyle}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                                  fontSize: '11px', fontWeight: '700',
                                  backgroundColor: typeColors.bg, color: typeColors.text,
                                }}>
                                  {txn.type}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(txn.amount)}</td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{txn.status || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right column — PDF viewer */}
          {!isMobile && (
            <div style={{ position: 'sticky', top: 0, height: '100%' }}>
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  style={{ width: '100%', height: '100%', minHeight: '700px', border: 'none', borderRadius: '10px' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%', minHeight: '700px',
                  backgroundColor: LIGHT, borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: MUTED, fontSize: '14px', border: `1px solid ${BORDER}`,
                }}>
                  PDF not available
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </AppShell>
  )
}
