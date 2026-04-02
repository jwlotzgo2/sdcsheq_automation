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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  INGESTED:    { bg: '#F3F4F6', text: '#374151' },
  EXTRACTING:  { bg: '#FEF3C7', text: '#92400E' },
  EXTRACTED:   { bg: '#DBEAFE', text: '#1E40AF' },
  RECONCILING: { bg: '#FEF3C7', text: '#92400E' },
  RECONCILED:  { bg: '#D1FAE5', text: '#065F46' },
  EXCEPTION:   { bg: '#FEE2E2', text: '#991B1B' },
  FAILED:      { bg: '#FEE2E2', text: '#991B1B' },
}

const LINE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  INVOICE:     { bg: '#FEF3C7', text: '#92400E' },
  PAYMENT:     { bg: '#D1FAE5', text: '#065F46' },
  CREDIT_NOTE: { bg: '#DBEAFE', text: '#1E40AF' },
  UNKNOWN:     { bg: '#F3F4F6', text: '#374151' },
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
  recon_matches: ReconMatch[] | null
}

interface ReconException {
  id: string
  statement_id: string
  exception_type: string
  reference: string | null
  amount: number | null
  xero_reference: string | null
  xero_amount: number | null
  resolution: string | null
  resolved_at: string | null
  created_at: string
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
      setLines((lineData as StatementLine[]) || [])
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

  const matchedCount = lines.filter(l => l.recon_matches && l.recon_matches.length > 0).length
  const matchRate = lines.length > 0 ? Math.round((matchedCount / lines.length) * 100) : 0

  const statusColors = statement ? (STATUS_COLORS[statement.status] || STATUS_COLORS.INGESTED) : STATUS_COLORS.INGESTED
  const canReconcile = statement && (statement.status === 'EXTRACTED' || statement.status === 'EXCEPTION')
  const hasXero = statement?.suppliers?.xero_contact_id

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

        {/* Two-column layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '24px',
          flex: 1,
          minHeight: 0,
        }}>

          {/* Left column — scrollable content */}
          <div style={{ overflowY: 'auto', paddingRight: '4px' }}>

            {/* Back link + Header */}
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

            {/* Summary card */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {[
                  { label: 'Opening Balance', value: fmt(statement?.opening_balance) },
                  { label: 'Closing Balance', value: fmt(statement?.closing_balance) },
                  { label: 'Period', value: (statement?.date_from && statement?.date_to) ? `${fmtDate(statement.date_from)} — ${fmtDate(statement.date_to)}` : '—' },
                  { label: 'Currency', value: statement?.currency || 'ZAR' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ minWidth: '120px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: DARK }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: MUTED, borderTop: `1px solid ${BORDER}`, paddingTop: '10px' }}>
                Lines: <strong style={{ color: DARK }}>{lines.length}</strong>
                {' | '}Matched: <strong style={{ color: DARK }}>{matchedCount}</strong>
                {' | '}Exceptions: <strong style={{ color: DARK }}>{exceptions.length}</strong>
                {' | '}Match rate: <strong style={{ color: DARK }}>{matchRate}%</strong>
              </div>
            </div>

            {/* Reconcile button */}
            {statement && (
              <div style={{ marginBottom: '20px' }}>
                {canReconcile ? (
                  hasXero ? (
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
                    <div title="Supplier not linked to Xero">
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
                  )
                ) : null}
              </div>
            )}

            {/* Statement Lines Table */}
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: DARK, marginBottom: '12px' }}>
                Statement Lines ({lines.length})
              </h2>
              <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: LIGHT }}>
                      {['Date', 'Ref', 'Description', 'Debit', 'Credit', 'Type', 'Match'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: MUTED, padding: '24px' }}>
                          No lines extracted yet.
                        </td>
                      </tr>
                    ) : lines.map(line => {
                      const match = line.recon_matches?.[0]
                      const typeColors = LINE_TYPE_COLORS[line.line_type || 'UNKNOWN'] || LINE_TYPE_COLORS.UNKNOWN

                      let matchBg = '#FEE2E2'
                      let matchText = '#991B1B'
                      let matchLabel = 'UNMATCHED'

                      if (match) {
                        if (match.match_type === 'EXACT') {
                          matchBg = '#D1FAE5'; matchText = '#065F46'; matchLabel = 'EXACT'
                        } else if (match.match_type === 'FUZZY') {
                          matchBg = '#DBEAFE'; matchText = '#1E40AF'
                          const pct = match.match_confidence != null ? Math.round(match.match_confidence * 100) : 0
                          matchLabel = `FUZZY ${pct}%`
                        } else if (match.match_type === 'MANUAL') {
                          matchBg = '#FEF3C7'; matchText = '#92400E'; matchLabel = 'MANUAL'
                        }
                      }

                      return (
                        <>
                          <tr key={line.id}>
                            <td style={tdStyle}>{fmtDate(line.line_date)}</td>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{line.reference || '—'}</td>
                            <td style={{ ...tdStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {line.description || '—'}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(line.debit_amount)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(line.credit_amount)}</td>
                            <td style={tdStyle}>
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                                fontSize: '11px', fontWeight: '700',
                                backgroundColor: typeColors.bg, color: typeColors.text,
                              }}>
                                {line.line_type || 'UNKNOWN'}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                                fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap',
                                backgroundColor: matchBg, color: matchText,
                              }}>
                                {matchLabel}
                              </span>
                            </td>
                          </tr>
                          {match && (
                            <tr key={`${line.id}-match`} style={{ backgroundColor: LIGHT }}>
                              <td colSpan={7} style={{ padding: '6px 12px', fontSize: '11px', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>
                                Xero: {match.xero_reference || '—'} | {fmtDate(match.xero_date)} | {fmt(match.xero_amount)} | Var: {fmt(match.variance_amount)}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Exceptions Section */}
            {exceptions.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: DARK, marginBottom: '12px' }}>
                  Exceptions ({exceptions.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {exceptions.map(exc => {
                    const isResolved = !!exc.resolved_at
                    const isResolving = resolvingId === exc.id

                    let label = ''
                    if (exc.exception_type === 'MISSING_IN_XERO') {
                      label = `Statement line ${exc.reference || '—'} (${fmt(exc.amount)}) — not found in Xero`
                    } else if (exc.exception_type === 'MISSING_ON_STATEMENT') {
                      label = `Xero ${exc.xero_reference || '—'} (${fmt(exc.xero_amount)}) — not on statement`
                    } else {
                      label = exc.exception_type
                    }

                    return (
                      <div
                        key={exc.id}
                        style={{
                          backgroundColor: WHITE,
                          border: `1px solid ${BORDER}`,
                          borderRadius: '8px',
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{
                              margin: 0,
                              fontSize: '13px',
                              color: isResolved ? MUTED : DARK,
                              textDecoration: isResolved ? 'line-through' : 'none',
                            }}>
                              {label}
                            </p>
                            {isResolved && exc.resolution && (
                              <p style={{ margin: '4px 0 0', fontSize: '12px', color: MUTED }}>
                                Resolved: {exc.resolution}
                              </p>
                            )}
                            {isResolving && (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
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
                            )}
                          </div>
                          {!isResolved && !isResolving && (
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
                                flexShrink: 0,
                              }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
