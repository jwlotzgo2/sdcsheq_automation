'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'
const GREEN  = '#059669'
const TEAL   = '#13B5EA'
const ORANGE = '#F97316'

const fmtDT = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

interface PostmarkMsg {
  messageId: string
  from: string
  fromName: string
  to: string
  subject: string
  date: string
  status: string
  attachments: { name: string; contentType: string; contentLength: number }[]
}

interface AppEmail {
  postmark_message_id: string
  sender: string
  subject: string
  attachment_count: number
  processed: boolean
  error: string | null
  received_at: string
  invoices: { id: string; status: string; supplier_name: string; invoice_number: string }[]
}

interface MergedRow {
  messageId: string
  from: string
  subject: string
  date: string
  postmarkStatus: string
  attachments: { name: string; contentType: string }[]
  pdfCount: number
  inApp: boolean
  appProcessed: boolean
  appError: string | null
  invoices: { id: string; status: string; supplier_name: string; invoice_number: string }[]
}

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

export default function EmailLogPage() {
  const [rows, setRows] = useState<MergedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [postmarkError, setPostmarkError] = useState('')
  const [stats, setStats] = useState({ postmarkTotal: 0, inApp: 0, missing: 0, retrying: 0, failed: 0, invoicesCreated: 0 })
  const router = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setPostmarkError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('email', user.email).maybeSingle()
    if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? '')) { router.push('/'); return }

    // Fetch both sources in parallel
    const [postmarkRes, { data: emailLogs }, { data: emailInvoices }] = await Promise.all([
      fetch('/api/admin/postmark-activity').then(r => r.json()).catch(() => ({ error: 'Failed to fetch' })),
      supabase.from('email_ingestion_log').select('*').order('received_at', { ascending: false }).limit(200),
      supabase.from('invoices').select('id, status, supplier_name, invoice_number, postmark_message_id').eq('source', 'EMAIL').order('created_at', { ascending: false }),
    ])

    if (postmarkRes.error) setPostmarkError(postmarkRes.error)
    const postmarkMsgs: PostmarkMsg[] = postmarkRes.messages ?? []

    // Build app data lookup
    const appMap: Record<string, AppEmail> = {}
    const invoiceMap: Record<string, any[]> = {}
    for (const inv of emailInvoices ?? []) {
      if (inv.postmark_message_id) {
        if (!invoiceMap[inv.postmark_message_id]) invoiceMap[inv.postmark_message_id] = []
        invoiceMap[inv.postmark_message_id].push(inv)
      }
    }
    for (const log of emailLogs ?? []) {
      appMap[log.postmark_message_id] = {
        ...log,
        invoices: invoiceMap[log.postmark_message_id] ?? [],
      }
    }

    // Merge: start from Postmark as source of truth
    const merged: MergedRow[] = postmarkMsgs.map(pm => {
      const app = appMap[pm.messageId]
      const pdfs = pm.attachments.filter(a => a.contentType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf'))
      return {
        messageId: pm.messageId,
        from: pm.from ?? pm.fromName ?? '',
        subject: pm.subject ?? '',
        date: pm.date,
        postmarkStatus: pm.status ?? '',
        attachments: pm.attachments,
        pdfCount: pdfs.length,
        inApp: !!app,
        appProcessed: app?.processed ?? false,
        appError: app?.error ?? null,
        invoices: app?.invoices ?? [],
      }
    })

    // Add any app entries not in Postmark (shouldn't happen but just in case)
    const pmIds = new Set(postmarkMsgs.map(m => m.messageId))
    for (const log of emailLogs ?? []) {
      if (!pmIds.has(log.postmark_message_id)) {
        merged.push({
          messageId: log.postmark_message_id,
          from: log.sender,
          subject: log.subject,
          date: log.received_at,
          postmarkStatus: 'unknown',
          attachments: [],
          pdfCount: log.attachment_count,
          inApp: true,
          appProcessed: log.processed,
          appError: log.error,
          invoices: invoiceMap[log.postmark_message_id] ?? [],
        })
      }
    }

    // Sort by date desc
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setRows(merged)
    setStats({
      postmarkTotal: postmarkMsgs.length,
      inApp: merged.filter(r => r.inApp).length,
      missing: merged.filter(r => !r.inApp).length,
      retrying: merged.filter(r => !r.inApp && r.postmarkStatus.toLowerCase() === 'scheduled').length,
      failed: merged.filter(r => !r.inApp && r.postmarkStatus.toLowerCase() === 'failed').length,
      invoicesCreated: (emailInvoices ?? []).length,
    })
    setLoading(false)
  }

  const statusBadge = (inv: any) => {
    const colors: Record<string, { bg: string; text: string }> = {
      INGESTED:           { bg: '#F3F4F6', text: '#374151' },
      EXTRACTING:         { bg: '#FEF3C7', text: '#92400E' },
      PENDING_REVIEW:     { bg: '#FEF3C7', text: AMBER },
      IN_REVIEW:          { bg: '#DBEAFE', text: '#1E40AF' },
      PENDING_APPROVAL:   { bg: '#F5F3FF', text: '#7C3AED' },
      APPROVED:           { bg: '#D1FAE5', text: '#065F46' },
      XERO_POSTED:        { bg: '#E6F6F4', text: '#0D7A6E' },
      XERO_PAID:          { bg: '#D1FAE5', text: '#166534' },
      REJECTED:           { bg: '#FEE2E2', text: '#991B1B' },
    }
    const c = colors[inv.status] ?? { bg: '#F3F4F6', text: '#374151' }
    return (
      <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: c.bg, color: c.text }}>
        {inv.status?.replace(/_/g, ' ')}
      </span>
    )
  }

  const [retrying, setRetrying] = useState<string | null>(null)

  const retryMessage = async (messageId: string) => {
    setRetrying(messageId)
    try {
      const res = await fetch('/api/admin/postmark-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      const data = await res.json()
      if (data.error) alert(`Retry failed: ${data.error}`)
      else alert('Retry triggered! Postmark will re-POST to your webhook. Refresh in a moment.')
    } catch { alert('Retry request failed') }
    setRetrying(null)
  }

  const getRowStatus = (row: MergedRow): { color: string; label: string } => {
    const ps = row.postmarkStatus.toLowerCase()
    if (!row.inApp && ps === 'failed') return { color: RED, label: 'FAILED' }
    if (!row.inApp && ps === 'scheduled') return { color: ORANGE, label: 'RETRYING' }
    if (!row.inApp && ps === 'queued') return { color: AMBER, label: 'QUEUED' }
    if (!row.inApp && ps === 'blocked') return { color: RED, label: 'BLOCKED' }
    if (!row.inApp) return { color: RED, label: 'MISSING' }
    if (row.appError) return { color: ORANGE, label: row.appError }
    if (row.invoices.length > 0) return { color: GREEN, label: `${row.invoices.length} invoice${row.invoices.length !== 1 ? 's' : ''}` }
    if (row.appProcessed) return { color: GREEN, label: 'Processed' }
    return { color: AMBER, label: 'Pending' }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '1100px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Email Ingestion Log</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Postmark inbound emails vs invoices in app — shows missing and failed deliveries</p>
        </div>

        {postmarkError && (
          <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: RED }}>
            Postmark API: {postmarkError}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'In Postmark', value: stats.postmarkTotal, color: DARK, border: BORDER },
            { label: 'In App', value: stats.inApp, color: GREEN, border: BORDER },
            { label: 'Retrying', value: stats.retrying, color: stats.retrying > 0 ? ORANGE : MUTED, border: stats.retrying > 0 ? ORANGE : BORDER },
            { label: 'Failed', value: stats.failed, color: stats.failed > 0 ? RED : MUTED, border: stats.failed > 0 ? RED : BORDER },
            { label: 'Missing', value: stats.missing, color: stats.missing > 0 ? RED : MUTED, border: stats.missing > 0 ? RED : BORDER },
            { label: 'Invoices', value: stats.invoicesCreated, color: TEAL, border: BORDER },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${s.border}`, padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Postmark vs App</span>
            <button onClick={load} style={{ fontSize: '11px', color: AMBER, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Refresh</button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading from Postmark & App...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>No emails found</div>
          ) : (
            <div>
              {rows.map(row => {
                const rs = getRowStatus(row)
                return (
                  <div key={row.messageId}>
                    <div
                      onClick={() => setExpandedId(expandedId === row.messageId ? null : row.messageId)}
                      style={{ padding: '10px 16px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: !row.inApp ? '#FEF2F2' : 'transparent' }}
                    >
                      {/* Status dot */}
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: rs.color }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.from}
                          </span>
                          {row.pdfCount > 0 && (
                            <span style={{ fontSize: '9px', color: TEAL, fontWeight: '600', flexShrink: 0 }}>
                              {row.pdfCount} PDF{row.pdfCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.subject || '(no subject)'}
                        </div>
                      </div>

                      {/* App status */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', color: DARK, fontWeight: '500' }}>{fmtDT(row.date)}</div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: rs.color, marginTop: '1px' }}>{rs.label}</div>
                      </div>

                      <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>{expandedId === row.messageId ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded */}
                    {expandedId === row.messageId && (
                      <div style={{ padding: '12px 16px 16px 36px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600' }}>Postmark ID: </span>
                            <span style={{ fontSize: '10px', color: DARK, fontFamily: 'monospace', wordBreak: 'break-all' }}>{row.messageId}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600' }}>Postmark Status: </span>
                            <span style={{ fontSize: '10px', color: DARK }}>{row.postmarkStatus || '—'}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600' }}>Received in App: </span>
                            <span style={{ fontSize: '10px', color: row.inApp ? GREEN : RED, fontWeight: '600' }}>{row.inApp ? 'Yes' : 'No — webhook delivery failed'}</span>
                          </div>
                        </div>

                        {/* Attachments */}
                        {row.attachments.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '4px' }}>Attachments</div>
                            {row.attachments.map((a, i) => (
                              <div key={i} style={{ fontSize: '11px', color: DARK, padding: '2px 0', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span>{a.contentType?.includes('pdf') || a.name?.toLowerCase().endsWith('.pdf') ? '📄' : '🖼'}</span>
                                <span>{a.name}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Invoices created */}
                        {row.invoices.length > 0 ? (
                          <>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '4px' }}>Invoices Created</div>
                            {row.invoices.map(inv => (
                              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
                                <span style={{ fontSize: '11px', fontWeight: '500', color: DARK, flex: 1 }}>
                                  {inv.supplier_name ?? 'Unknown'} — {inv.invoice_number ?? '—'}
                                </span>
                                {statusBadge(inv)}
                              </div>
                            ))}
                          </>
                        ) : !row.inApp ? (
                          <div>
                            <div style={{ fontSize: '12px', color: RED, fontWeight: '500', marginBottom: '8px' }}>
                              {row.postmarkStatus.toLowerCase() === 'failed'
                                ? 'Webhook delivery failed after 10 retries.'
                                : row.postmarkStatus.toLowerCase() === 'scheduled'
                                ? 'Postmark is retrying delivery to your webhook.'
                                : 'This email never reached the app.'}
                            </div>
                            {row.postmarkStatus.toLowerCase() === 'failed' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); retryMessage(row.messageId) }}
                                disabled={retrying === row.messageId}
                                style={{ padding: '6px 14px', borderRadius: '6px', border: `1.5px solid ${ORANGE}`, backgroundColor: WHITE, color: ORANGE, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                {retrying === row.messageId ? 'Retrying...' : 'Retry Delivery'}
                              </button>
                            )}
                          </div>
                        ) : row.appError ? (
                          <div style={{ fontSize: '12px', color: ORANGE }}>{row.appError}</div>
                        ) : (
                          <div style={{ fontSize: '12px', color: MUTED }}>No invoices created</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
