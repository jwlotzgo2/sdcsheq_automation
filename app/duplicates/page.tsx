'use client'

import { useEffect, useState } from 'react'
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
const RED    = '#EF4444'
const REDL   = '#FEE2E2'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const fmtShort = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'


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

export default function DuplicatesPage() {
  const [logs, setLogs]                   = useState<any[]>([])
  const [summary, setSummary]             = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [view, setView]                   = useState<'summary' | 'detail'>('summary')
  const [showArchived, setShowArchived]   = useState(false)
  const [selectedLog, setSelectedLog]     = useState<any>(null)
  const [selectedSender, setSelectedSender] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [marking, setMarking]             = useState<string | null>(null)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (mounted) fetchData() }, [showArchived, mounted])

  const fetchData = async () => {
    setLoading(true)
    let query = supabase
      .from('duplicate_log')
      .select(`
        id, received_at, sender, subject, file_hash, postmark_message_id,
        reviewed, reviewed_at, reviewed_by,
        invoices!matched_invoice_id (
          id, invoice_number, supplier_name, amount_incl, invoice_date, status
        )
      `)
      .order('received_at', { ascending: false })

    if (!showArchived) query = query.eq('reviewed', false)

    const { data: logData } = await query
    setLogs(logData ?? [])

    // Build summary from unreviewed only for active counts
    const { data: allUnreviewed } = await supabase
      .from('duplicate_log')
      .select('sender, received_at, invoices!matched_invoice_id(invoice_number)')
      .eq('reviewed', false)
      .order('received_at', { ascending: false })

    const senderMap: Record<string, any> = {}
    ;(allUnreviewed ?? []).forEach((log: any) => {
      const s = log.sender
      if (!senderMap[s]) senderMap[s] = { sender: s, count: 0, first: log.received_at, last: log.received_at, invoices: new Set() }
      senderMap[s].count++
      if (log.received_at < senderMap[s].first) senderMap[s].first = log.received_at
      if (log.received_at > senderMap[s].last)  senderMap[s].last  = log.received_at
      if (log.invoices?.invoice_number) senderMap[s].invoices.add(log.invoices.invoice_number)
    })

    setSummary(Object.values(senderMap).sort((a: any, b: any) => b.count - a.count))
    setLoading(false)
  }

  const markReviewed = async (id: string) => {
    setMarking(id)
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('duplicate_log').update({
      reviewed: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.email,
    }).eq('id', id)
    // If it was selected, close the panel
    if (selectedLog?.id === id) setSelectedLog(null)
    await fetchData()
    setMarking(null)
  }

  const markSenderReviewed = async (sender: string) => {
    setMarking(sender)
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('duplicate_log').update({
      reviewed: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.email,
    }).eq('sender', sender).eq('reviewed', false)
    setSelectedSender(null)
    await fetchData()
    setMarking(null)
  }

  if (!mounted) return null

  const totalUnreviewed = logs.filter(l => !l.reviewed).length
  const uniqueSenders   = new Set(logs.map((l: any) => l.sender)).size
  const senderLogs      = selectedSender ? logs.filter(l => l.sender === selectedSender) : []
  const showPanel       = selectedLog || selectedSender

  return (
    <AppShell>
      <div style={{ maxWidth: '1300px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '20px' }}>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Duplicate Invoice Log</h1>
              <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Track duplicate submissions to educate suppliers</p>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} suppressHydrationWarning>
              <button onClick={() => { setView('summary'); setSelectedLog(null); setSelectedSender(null) }} suppressHydrationWarning style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: view === 'summary' ? '700' : '400', border: view === 'summary' ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`, backgroundColor: view === 'summary' ? AMBER : WHITE, color: view === 'summary' ? WHITE : MUTED, cursor: 'pointer' }}>
                By Supplier
              </button>
              <button onClick={() => { setView('detail'); setSelectedLog(null); setSelectedSender(null) }} suppressHydrationWarning style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: view === 'detail' ? '700' : '400', border: view === 'detail' ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`, backgroundColor: view === 'detail' ? AMBER : WHITE, color: view === 'detail' ? WHITE : MUTED, cursor: 'pointer' }}>
                All Events
              </button>
              <button onClick={() => setShowArchived(!showArchived)} suppressHydrationWarning style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', border: `1.5px solid ${BORDER}`, backgroundColor: showArchived ? DARK : WHITE, color: showArchived ? WHITE : MUTED, cursor: 'pointer', fontWeight: showArchived ? '600' : '400' }}>
                {showArchived ? '✓ Archived' : 'Show Archived'}
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Unreviewed Duplicates', value: summary.reduce((s: number, x: any) => s + x.count, 0), color: RED,   bg: REDL },
              { label: 'Suppliers Sending Dupes', value: summary.length,  color: AMBER, bg: '#FEF3C7' },
              { label: 'Blocked from Processing', value: summary.reduce((s: number, x: any) => s + x.count, 0), color: OLIVE, bg: '#F0FDF4' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px' }}>
                <div style={{ display: 'inline-block', backgroundColor: bg, borderRadius: '5px', padding: '3px 8px', fontSize: '10px', fontWeight: '600', color, marginBottom: '8px' }}>{label}</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: DARK }}>{loading ? '—' : value}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>
                {showArchived ? 'No archived duplicates' : 'No unreviewed duplicates'}
              </div>
              <div style={{ fontSize: '13px', color: MUTED }}>
                {showArchived ? 'Archived duplicates will appear here.' : 'All duplicates have been reviewed.'}
              </div>
            </div>
          ) : view === 'summary' ? (

            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {!isMobile && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 130px 130px 100px', padding: '10px 20px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                  {['Supplier / Sender', 'Dupes', 'Unique Invoices', 'First Seen', 'Last Seen', ''].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                  ))}
                </div>
              )}
              {summary.map((s: any, i: number) => (
                isMobile ? (
                  <div key={s.sender} onClick={() => { setSelectedSender(s.sender); setSelectedLog(null) }}
                    style={{ padding: '14px 16px', borderBottom: i < summary.length - 1 ? `1px solid ${LIGHT}` : 'none', backgroundColor: selectedSender === s.sender ? '#FEF3C7' : WHITE, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: DARK, flex: 1, marginRight: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sender}</span>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '10px', backgroundColor: s.count >= 5 ? REDL : '#FEF3C7', color: s.count >= 5 ? RED : AMBER, fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>{s.count}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: MUTED }}>{s.invoices.size} unique · Last: {fmtShort(s.last)}</span>
                      <button onClick={e => { e.stopPropagation(); markSenderReviewed(s.sender) }} disabled={marking === s.sender}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: OLIVE, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        {marking === s.sender ? '...' : '✓ Mark All'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={s.sender} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 130px 130px 100px', padding: '14px 20px', borderBottom: i < summary.length - 1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center', backgroundColor: selectedSender === s.sender ? '#FEF3C7' : WHITE }}>
                    <div onClick={() => { setSelectedSender(s.sender); setSelectedLog(null) }} style={{ fontSize: '13px', fontWeight: '600', color: DARK, cursor: 'pointer' }}>{s.sender}</div>
                    <div><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', backgroundColor: s.count >= 5 ? REDL : '#FEF3C7', color: s.count >= 5 ? RED : AMBER, fontSize: '12px', fontWeight: '700' }}>{s.count}</span></div>
                    <div style={{ fontSize: '13px', color: DARK }}>{s.invoices.size}</div>
                    <div style={{ fontSize: '12px', color: MUTED }}>{fmtShort(s.first)}</div>
                    <div style={{ fontSize: '12px', color: MUTED }}>{fmtShort(s.last)}</div>
                    <div><button onClick={() => markSenderReviewed(s.sender)} disabled={marking === s.sender} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: OLIVE, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>{marking === s.sender ? '...' : '✓ Mark All'}</button></div>
                  </div>
                )
              ))}
            </div>

          ) : (

            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {!isMobile && (
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px 110px 90px 80px', padding: '10px 20px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                  {['Received', 'Sender', 'Invoice #', 'Supplier', 'Amount', ''].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                  ))}
                </div>
              )}
              {logs.map((log: any, i: number) => (
                <div
                  key={log.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '160px 1fr 110px 110px 90px 80px',
                    padding: '12px 20px', borderBottom: i < logs.length - 1 ? `1px solid ${LIGHT}` : 'none',
                    alignItems: 'center',
                    backgroundColor: selectedLog?.id === log.id ? '#FEF3C7' : log.reviewed ? '#FAFAF8' : WHITE,
                    opacity: log.reviewed ? 0.6 : 1,
                  }}
                >
                  <div onClick={() => { setSelectedLog(log); setSelectedSender(null) }} style={{ fontSize: '11px', color: MUTED, cursor: 'pointer' }}>{fmtDate(log.received_at)}</div>
                  <div onClick={() => { setSelectedLog(log); setSelectedSender(null) }} style={{ fontSize: '12px', color: DARK, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px', cursor: 'pointer' }}>{log.sender}</div>
                  <div style={{ fontSize: '12px', color: DARK }}>{log.invoices?.invoice_number ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.invoices?.supplier_name ?? '—'}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: DARK }}>{fmt(log.invoices?.amount_incl)}</div>
                  <div>
                    {log.reviewed ? (
                      <span style={{ fontSize: '11px', color: OLIVE, fontWeight: '600' }}>✓ Reviewed</span>
                    ) : (
                      <button
                        onClick={() => markReviewed(log.id)}
                        disabled={marking === log.id}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: OLIVE, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        {marking === log.id ? '...' : '✓ Done'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {showPanel && (
          <div style={isMobile ? { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' } : { width: '300px', flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: '76px' }}
            onClick={isMobile ? () => { setSelectedLog(null); setSelectedSender(null) } : undefined}>
          <div style={isMobile ? { width: '100%', backgroundColor: WHITE, borderRadius: '16px 16px 0 0', padding: '20px 20px 40px', maxHeight: '80vh', overflowY: 'auto' } : {}}
            onClick={isMobile ? e => e.stopPropagation() : undefined}>
          {isMobile && <div style={{ width: '40px', height: '4px', backgroundColor: BORDER, borderRadius: '2px', margin: '0 auto 12px' }} />}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: 0 }}>
                  {selectedSender ? 'Sender History' : 'Event Detail'}
                </h2>
                <button onClick={() => { setSelectedLog(null); setSelectedSender(null) }} style={{ background: 'none', border: 'none', fontSize: '18px', color: MUTED, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>

              {selectedSender && (
                <>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '4px', wordBreak: 'break-all' }}>{selectedSender}</div>
                  <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px' }}>{senderLogs.length} event{senderLogs.length !== 1 ? 's' : ''}</div>
                  <div style={{ backgroundColor: REDL, borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Detection Reason</div>
                    <div style={{ fontSize: '12px', color: DARK }}>Identical file content — SHA-256 hash matched existing invoice records.</div>
                  </div>
                  {!showArchived && (
                    <button
                      onClick={() => markSenderReviewed(selectedSender)}
                      disabled={marking === selectedSender}
                      style={{ width: '100%', padding: '9px', borderRadius: '7px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '12px' }}
                    >
                      {marking === selectedSender ? 'Marking...' : '✓ Mark All as Reviewed'}
                    </button>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {senderLogs.map((log: any) => (
                      <div key={log.id} style={{ padding: '10px 12px', backgroundColor: LIGHT, borderRadius: '6px', border: `1px solid ${BORDER}`, opacity: log.reviewed ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: MUTED }}>{fmtDate(log.received_at)}</span>
                          {log.reviewed && <span style={{ fontSize: '10px', color: OLIVE, fontWeight: '600' }}>✓</span>}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: DARK, marginBottom: '2px' }}>{log.invoices?.invoice_number ?? '—'} — {fmt(log.invoices?.amount_incl)}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{log.invoices?.supplier_name ?? '—'}</div>
                        {log.invoices?.id && (
                          <Link href={`/invoices/${log.invoices.id}`} style={{ fontSize: '11px', color: AMBER, fontWeight: '600', textDecoration: 'none', display: 'block', marginTop: '6px' }}>
                            View original →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedLog && (
                <>
                  <div style={{ backgroundColor: REDL, borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Detection Reason</div>
                    <div style={{ fontSize: '12px', color: DARK }}>Identical file content detected</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>SHA-256 hash matched an existing invoice. The PDF is byte-for-byte identical.</div>
                  </div>
                  {!selectedLog.reviewed && (
                    <button
                      onClick={() => markReviewed(selectedLog.id)}
                      disabled={marking === selectedLog.id}
                      style={{ width: '100%', padding: '9px', borderRadius: '7px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '14px' }}
                    >
                      {marking === selectedLog.id ? 'Marking...' : '✓ Mark as Reviewed'}
                    </button>
                  )}
                  {selectedLog.reviewed && (
                    <div style={{ backgroundColor: '#F0FDF4', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: OLIVE, fontWeight: '600' }}>
                      ✓ Reviewed by {selectedLog.reviewed_by} · {fmtShort(selectedLog.reviewed_at)}
                    </div>
                  )}
                  {[
                    { label: 'Received', value: fmtDate(selectedLog.received_at) },
                    { label: 'From',     value: selectedLog.sender },
                    { label: 'Subject',  value: selectedLog.subject || '(no subject)' },
                    { label: 'Hash',     value: selectedLog.file_hash?.slice(0, 16) + '...' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: DARK, wordBreak: 'break-all' }}>{value}</div>
                    </div>
                  ))}
                  {selectedLog.invoices && (
                    <>
                      <div style={{ borderTop: `1px solid ${BORDER}`, margin: '14px 0' }} />
                      <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Matched Original Invoice</div>
                      {[
                        { label: 'Invoice #', value: selectedLog.invoices.invoice_number ?? '—' },
                        { label: 'Supplier',  value: selectedLog.invoices.supplier_name ?? '—' },
                        { label: 'Amount',    value: fmt(selectedLog.invoices.amount_incl) },
                        { label: 'Date',      value: fmtShort(selectedLog.invoices.invoice_date) },
                        { label: 'Status',    value: selectedLog.invoices.status },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
                          <span style={{ fontSize: '12px', color: MUTED }}>{label}</span>
                          <span style={{ fontSize: '12px', fontWeight: '500', color: DARK, textAlign: 'right', maxWidth: '170px' }}>{value}</span>
                        </div>
                      ))}
                      <Link href={`/invoices/${selectedLog.invoices.id}`} style={{ display: 'block', marginTop: '12px', padding: '8px', backgroundColor: LIGHT, borderRadius: '6px', textAlign: 'center', color: AMBER, fontSize: '12px', fontWeight: '600', textDecoration: 'none', border: `1px solid ${BORDER}` }}>
                        View Original Invoice →
                      </Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
