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

const fmtDT = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

interface EmailLog {
  id: string
  postmark_message_id: string
  received_at: string
  sender: string
  subject: string
  attachment_count: number
  processed: boolean
  error: string | null
  created_at: string
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
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [stats, setStats] = useState({ total: 0, processed: 0, errors: 0, invoicesCreated: 0 })
  const router = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('email', user.email).maybeSingle()
    if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? '')) { router.push('/'); return }

    // Fetch email logs
    const { data: emailLogs } = await supabase
      .from('email_ingestion_log')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(100)

    // Fetch invoices created from email
    const { data: emailInvoices } = await supabase
      .from('invoices')
      .select('id, status, supplier_name, invoice_number, postmark_message_id')
      .eq('source', 'EMAIL')
      .order('created_at', { ascending: false })

    // Join invoices to their email log entries
    const invoiceMap: Record<string, any[]> = {}
    for (const inv of emailInvoices ?? []) {
      if (inv.postmark_message_id) {
        if (!invoiceMap[inv.postmark_message_id]) invoiceMap[inv.postmark_message_id] = []
        invoiceMap[inv.postmark_message_id].push(inv)
      }
    }

    const enriched = (emailLogs ?? []).map(log => ({
      ...log,
      invoices: invoiceMap[log.postmark_message_id] ?? [],
    }))

    setLogs(enriched)

    // Stats
    const total = enriched.length
    const processed = enriched.filter(l => l.processed).length
    const errors = enriched.filter(l => l.error).length
    const invoicesCreated = (emailInvoices ?? []).length
    setStats({ total, processed, errors, invoicesCreated })

    setLoading(false)
  }

  const statusBadge = (inv: any) => {
    const colors: Record<string, { bg: string; text: string }> = {
      INGESTED:           { bg: '#F3F4F6', text: '#374151' },
      EXTRACTING:         { bg: '#FEF3C7', text: '#92400E' },
      PENDING_REVIEW:     { bg: AMBER + '20', text: AMBER },
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

  return (
    <AppShell>
      <div style={{ maxWidth: '1000px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Email Ingestion Log</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Track inbound emails from Postmark and their processing status</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Emails Received', value: stats.total, color: DARK },
            { label: 'Processed', value: stats.processed, color: GREEN },
            { label: 'Errors', value: stats.errors, color: stats.errors > 0 ? RED : MUTED },
            { label: 'Invoices Created', value: stats.invoicesCreated, color: TEAL },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Log table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Emails</span>
            <button onClick={load} style={{ fontSize: '11px', color: AMBER, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Refresh</button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>No emails received yet</div>
          ) : (
            <div>
              {logs.map(log => (
                <div key={log.id}>
                  <div
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    style={{ padding: '12px 16px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
                  >
                    {/* Status indicator */}
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: log.error ? RED : log.processed ? GREEN : AMBER,
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.sender}
                        </span>
                        <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>
                          {log.attachment_count} attachment{log.attachment_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.subject || '(no subject)'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '11px', color: DARK, fontWeight: '500' }}>{fmtDT(log.received_at)}</div>
                      <div style={{ fontSize: '10px', marginTop: '2px' }}>
                        {log.error ? (
                          <span style={{ color: RED, fontWeight: '600' }}>{log.error}</span>
                        ) : log.invoices.length > 0 ? (
                          <span style={{ color: GREEN, fontWeight: '600' }}>{log.invoices.length} invoice{log.invoices.length !== 1 ? 's' : ''}</span>
                        ) : (
                          <span style={{ color: MUTED }}>Processing</span>
                        )}
                      </div>
                    </div>

                    <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>{expandedId === log.id ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === log.id && (
                    <div style={{ padding: '12px 16px 16px 36px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600' }}>Postmark ID: </span>
                          <span style={{ fontSize: '10px', color: DARK, fontFamily: 'monospace' }}>{log.postmark_message_id}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600' }}>Received: </span>
                          <span style={{ fontSize: '10px', color: DARK }}>{fmtDT(log.received_at)}</span>
                        </div>
                      </div>

                      {log.invoices.length > 0 ? (
                        <>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', marginBottom: '6px' }}>Invoices Created</div>
                          {log.invoices.map(inv => (
                            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                              <span style={{ fontSize: '12px', fontWeight: '500', color: DARK, flex: 1 }}>
                                {inv.supplier_name ?? 'Unknown'} — {inv.invoice_number ?? '—'}
                              </span>
                              {statusBadge(inv)}
                            </div>
                          ))}
                        </>
                      ) : log.error ? (
                        <div style={{ fontSize: '12px', color: RED }}>{log.error}</div>
                      ) : (
                        <div style={{ fontSize: '12px', color: MUTED }}>No invoices created from this email</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
