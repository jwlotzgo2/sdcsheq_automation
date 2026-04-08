// app/statements/[id]/page.tsx
'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  EXACT:     { bg: '#D1FAE5', text: '#065F46' },
  FUZZY:     { bg: '#DBEAFE', text: '#1E40AF' },
  MANUAL:    { bg: '#FEF3C7', text: '#92400E' },
  UNMATCHED: { bg: '#FEE2E2', text: '#991B1B' },
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
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    // Admin-only page guard
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('email', user.email).maybeSingle()
    if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? '')) { router.push('/'); return }

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

  // Compact shared styles
  const compactTh: React.CSSProperties = {
    padding: '6px 10px',
    textAlign: 'left',
    color: MUTED,
    fontWeight: '600',
    fontSize: '10px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderBottom: `2px solid ${BORDER}`,
    backgroundColor: LIGHT,
  }

  const compactTd: React.CSSProperties = {
    padding: '6px 10px',
    color: DARK,
    fontSize: '12px',
    borderBottom: `1px solid ${BORDER}`,
  }

  // Resolve UI for an exception
  const renderResolveUI = (exc: ReconException) => {
    const isResolved = !!exc.resolved_at
    const isResolving = resolvingId === exc.id

    if (isResolved) {
      return (
        <span style={{ fontSize: '11px', color: MUTED, textDecoration: 'line-through' }}>Resolved: {exc.resolution}</span>
      )
    }

    if (isResolving) {
      return (
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
          <input
            type="text"
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            placeholder="Resolution notes..."
            style={{
              flex: 1,
              padding: '5px 8px',
              border: `1px solid ${BORDER}`,
              borderRadius: '4px',
              fontSize: '12px',
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
              padding: '5px 10px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: resolution.trim() ? AMBER : '#C8B89A',
              color: WHITE,
              fontSize: '11px',
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
              padding: '5px 8px',
              borderRadius: '4px',
              border: `1px solid ${BORDER}`,
              backgroundColor: WHITE,
              color: MUTED,
              fontSize: '11px',
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
          padding: '3px 10px',
          borderRadius: '4px',
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          color: DARK,
          fontSize: '11px',
          fontWeight: '600',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Resolve
      </button>
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
      <div style={{ padding: '20px 28px', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>

        {/* Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              href="/statements"
              style={{ fontSize: '12px', color: MUTED, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              ← Back
            </Link>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: DARK, margin: 0 }}>
              {statement?.suppliers?.name || '—'}
            </h1>
            {statement && (
              <span style={{
                display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                fontSize: '10px', fontWeight: '700',
                backgroundColor: statusColors.bg, color: statusColors.text,
              }}>
                {statement.status}
              </span>
            )}
            {statement?.statement_date && (
              <span style={{ fontSize: '12px', color: MUTED }}>{fmtDate(statement.statement_date)}</span>
            )}
          </div>
          {statement && canReconcile && (
            <div>
              {hasXero ? (
                <button
                  onClick={handleReconcile}
                  disabled={reconciling}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: reconciling ? '#C8B89A' : AMBER,
                    color: WHITE,
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: reconciling ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reconciling ? 'Reconciling...' : 'Run Reconciliation'}
                </button>
              ) : (
                <span style={{ fontSize: '11px', color: MUTED }}>Supplier not linked to Xero</span>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p style={{ color: RED, fontSize: '12px', margin: '0 0 10px' }}>{error}</p>
        )}

        {/* Two-column layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 520px',
          gap: '20px',
          flex: 1,
          minHeight: 0,
        }}>

          {/* Left column */}
          <div style={{ overflowY: 'auto', paddingRight: '4px' }}>

            {/* Balance Comparison — slim card */}
            <div style={{
              backgroundColor: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: '8px',
              padding: '14px 20px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', flex: '1 1 100px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '3px' }}>
                    Supplier Says
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: DARK }}>
                    {fmt(supplierBalance)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: '1 1 100px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '3px' }}>
                    Xero Says
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: DARK }}>
                    {xeroTxns.length > 0 ? fmt(ourBalance) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: '1 1 100px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '3px' }}>
                    Difference
                  </div>
                  <div style={{
                    fontSize: '16px', fontWeight: '700',
                    color: xeroTxns.length > 0 ? (difference === 0 ? '#065F46' : RED) : MUTED,
                  }}>
                    {xeroTxns.length > 0 ? fmt(Math.abs(difference)) : '—'}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: '11px', color: MUTED,
                borderTop: `1px solid ${BORDER}`, paddingTop: '8px', marginTop: '10px',
                display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px',
              }}>
                <span>
                  <strong style={{ color: DARK }}>{matchedCount}</strong> of <strong style={{ color: DARK }}>{lines.length}</strong> matched
                  {unresolvedExceptions.length > 0 && (
                    <> | <strong style={{ color: RED }}>{unresolvedExceptions.length}</strong> exceptions</>
                  )}
                </span>
                {statement?.date_from && statement?.date_to && (
                  <span>{fmtDate(statement.date_from)} — {fmtDate(statement.date_to)}</span>
                )}
              </div>
            </div>

            {/* Xero Transactions Table */}
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: '0 0 8px' }}>
                Xero Transactions ({xeroTxns.length})
              </h2>
              {xeroTxns.length === 0 ? (
                <div style={{
                  backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '8px',
                  textAlign: 'center', color: MUTED, fontSize: '12px', padding: '20px',
                }}>
                  Run reconciliation to fetch Xero data
                </div>
              ) : (
                <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Reference', 'Type', 'Amount', 'Status'].map(h => (
                            <th key={h} style={compactTh}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xeroTxns.map((txn, i) => {
                          const typeColors = XERO_TYPE_COLORS[txn.type] || { bg: '#F3F4F6', text: '#374151' }
                          return (
                            <tr key={txn.xero_id || i}>
                              <td style={compactTd}>{fmtDate(txn.date)}</td>
                              <td style={{ ...compactTd, whiteSpace: 'nowrap' }}>{txn.reference || '—'}</td>
                              <td style={compactTd}>
                                <span style={{
                                  display: 'inline-block', padding: '1px 6px', borderRadius: '3px',
                                  fontSize: '10px', fontWeight: '700',
                                  backgroundColor: typeColors.bg, color: typeColors.text,
                                }}>
                                  {txn.type}
                                </span>
                              </td>
                              <td style={{ ...compactTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(txn.amount)}</td>
                              <td style={{ ...compactTd, whiteSpace: 'nowrap' }}>{txn.status || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Statement Lines Table */}
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: '0 0 8px' }}>
                Statement Lines ({lines.length})
              </h2>
              {lines.length === 0 ? (
                <div style={{
                  backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '8px',
                  textAlign: 'center', color: MUTED, fontSize: '12px', padding: '20px',
                }}>
                  No statement lines extracted
                </div>
              ) : (
                <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Ref', 'Description', 'Debit', 'Credit', 'Type', 'Match'].map(h => (
                            <th key={h} style={compactTh}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map(line => {
                          const match = line.recon_matches.length > 0 ? line.recon_matches[0] : null
                          const hasMatch = !!match

                          let matchLabel = 'UNMATCHED'
                          let matchColors = MATCH_COLORS.UNMATCHED
                          if (match) {
                            matchLabel = match.match_type
                            matchColors = MATCH_COLORS[match.match_type] || MATCH_COLORS.MANUAL
                            if (match.match_type === 'FUZZY' && match.match_confidence != null) {
                              matchLabel = `FUZZY ${Math.round(match.match_confidence * 100)}%`
                            }
                          }

                          return (
                            <Fragment key={line.id}>
                              <tr>
                                <td style={compactTd}>{fmtDate(line.line_date)}</td>
                                <td style={{ ...compactTd, whiteSpace: 'nowrap' }}>{line.reference || '—'}</td>
                                <td style={{ ...compactTd, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {line.description || '—'}
                                </td>
                                <td style={{ ...compactTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {line.debit_amount != null ? fmt(line.debit_amount) : '—'}
                                </td>
                                <td style={{ ...compactTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {line.credit_amount != null ? fmt(line.credit_amount) : '—'}
                                </td>
                                <td style={compactTd}>
                                  {line.line_type && (
                                    <span style={{ fontSize: '10px', color: MUTED }}>{line.line_type}</span>
                                  )}
                                </td>
                                <td style={compactTd}>
                                  <span style={{
                                    display: 'inline-block', padding: '1px 6px', borderRadius: '3px',
                                    fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap',
                                    backgroundColor: matchColors.bg, color: matchColors.text,
                                  }}>
                                    {matchLabel}
                                  </span>
                                </td>
                              </tr>
                              {hasMatch && (
                                <tr>
                                  <td colSpan={7} style={{
                                    padding: '3px 10px 5px 28px',
                                    backgroundColor: LIGHT,
                                    fontSize: '11px',
                                    color: MUTED,
                                    borderBottom: `1px solid ${BORDER}`,
                                  }}>
                                    Xero: <strong style={{ color: DARK }}>{match!.xero_reference || '—'}</strong>
                                    {' '}| {fmt(match!.xero_amount)}
                                    {match!.variance_amount != null && match!.variance_amount !== 0 && (
                                      <span style={{ color: RED, marginLeft: '8px' }}>
                                        variance {fmt(match!.variance_amount)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Reconciliation Summary */}
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: '0 0 8px' }}>
                Reconciliation Summary
              </h2>
              <div style={{
                backgroundColor: WHITE,
                border: `1px solid ${BORDER}`,
                borderRadius: '8px',
                padding: '16px 18px',
              }}>
                {exceptions.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#065F46',
                    }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#065F46' }}>All lines reconciled</span>
                  </div>
                )}

                {/* MISSING_IN_XERO group */}
                {missingInXero.length > 0 && (
                  <div style={{ marginBottom: missingOnStatement.length > 0 || otherExceptions.length > 0 ? '16px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{
                        display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: AMBER,
                      }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: DARK }}>Request from Supplier</span>
                    </div>
                    <p style={{ fontSize: '11px', color: MUTED, margin: '0 0 8px', lineHeight: '1.4' }}>
                      These items are on the supplier's statement but not in our Xero. Request the original documents.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {missingInXero.map(exc => {
                        const isResolved = !!exc.resolved_at
                        const excLine = exc.statement_line_id ? lines.find(l => l.id === exc.statement_line_id) : null
                        const ref = excLine?.reference || exc.xero_reference || '—'
                        const desc = excLine?.description || exc.notes || ''
                        const amount = excLine ? (excLine.debit_amount || excLine.credit_amount) : exc.xero_amount

                        return (
                          <div key={exc.id} style={{
                            padding: '6px 10px',
                            backgroundColor: isResolved ? LIGHT : WHITE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: '4px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{
                                display: 'flex', gap: '8px', alignItems: 'baseline', flex: 1,
                                textDecoration: isResolved ? 'line-through' : 'none',
                                color: isResolved ? MUTED : DARK,
                                fontSize: '12px',
                              }}>
                                <span style={{ fontWeight: '600' }}>{ref}</span>
                                {desc && (
                                  <span style={{ color: MUTED, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                    {desc}
                                  </span>
                                )}
                                <span style={{ fontWeight: '600', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmt(amount)}</span>
                              </div>
                              {!isResolved && resolvingId !== exc.id && (
                                <div style={{ flexShrink: 0 }}>{renderResolveUI(exc)}</div>
                              )}
                            </div>
                            {isResolved && <div style={{ marginTop: '2px' }}>{renderResolveUI(exc)}</div>}
                            {!isResolved && resolvingId === exc.id && <div>{renderResolveUI(exc)}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* MISSING_ON_STATEMENT group */}
                {missingOnStatement.length > 0 && (
                  <div style={{ marginBottom: otherExceptions.length > 0 ? '16px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{
                        display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: BLUE,
                      }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: DARK }}>Send to Supplier</span>
                    </div>
                    <p style={{ fontSize: '11px', color: MUTED, margin: '0 0 8px', lineHeight: '1.4' }}>
                      These transactions are in our Xero but not on the supplier's statement. Send these documents to the supplier.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {missingOnStatement.map(exc => {
                        const isResolved = !!exc.resolved_at

                        return (
                          <div key={exc.id} style={{
                            padding: '6px 10px',
                            backgroundColor: isResolved ? LIGHT : WHITE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: '4px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{
                                display: 'flex', gap: '8px', alignItems: 'baseline', flex: 1,
                                textDecoration: isResolved ? 'line-through' : 'none',
                                color: isResolved ? MUTED : DARK,
                                fontSize: '12px',
                              }}>
                                <span style={{ fontWeight: '600' }}>{exc.xero_reference || '—'}</span>
                                <span style={{ fontWeight: '600', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmt(exc.xero_amount)}</span>
                              </div>
                              {!isResolved && resolvingId !== exc.id && (
                                <div style={{ flexShrink: 0 }}>{renderResolveUI(exc)}</div>
                              )}
                            </div>
                            {isResolved && <div style={{ marginTop: '2px' }}>{renderResolveUI(exc)}</div>}
                            {!isResolved && resolvingId === exc.id && <div>{renderResolveUI(exc)}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Other exceptions */}
                {otherExceptions.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{
                        display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: MUTED,
                      }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: DARK }}>Other Exceptions ({otherExceptions.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {otherExceptions.map(exc => {
                        const isResolved = !!exc.resolved_at
                        return (
                          <div key={exc.id} style={{
                            padding: '6px 10px',
                            backgroundColor: isResolved ? LIGHT : WHITE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: '4px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{
                                fontSize: '12px', color: isResolved ? MUTED : DARK,
                                textDecoration: isResolved ? 'line-through' : 'none',
                              }}>
                                {exc.xero_reference || exc.notes || '—'} — {fmt(exc.xero_amount)}
                              </span>
                              {!isResolved && resolvingId !== exc.id && (
                                <div style={{ flexShrink: 0 }}>{renderResolveUI(exc)}</div>
                              )}
                            </div>
                            {isResolved && <div style={{ marginTop: '2px' }}>{renderResolveUI(exc)}</div>}
                            {!isResolved && resolvingId === exc.id && <div>{renderResolveUI(exc)}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right column — PDF viewer */}
          {!isMobile && (
            <div style={{ position: 'sticky', top: 0, height: '100%' }}>
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', borderRadius: '8px' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%', minHeight: '600px',
                  backgroundColor: LIGHT, borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: MUTED, fontSize: '13px', border: `1px solid ${BORDER}`,
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
