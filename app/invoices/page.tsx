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

// Invoices sitting at status=INGESTED this long are considered stuck:
// the extractor never ran (or crashed) and the user should get a 1-click
// rescue button. Tuned short because healthy extraction completes in ~5s.
const STALE_MINUTES = 2

const ageMinutes = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / 60000)

const isStuck = (inv: { status: string; created_at: string }) =>
  inv.status === 'INGESTED' && ageMinutes(inv.created_at) >= STALE_MINUTES

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  INGESTED:          { color: '#64748B', bg: '#F1F5F9', label: 'Ingested' },
  EXTRACTING:        { color: '#8B5CF6', bg: '#F5F3FF', label: 'Extracting' },
  EXTRACTION_FAILED: { color: RED,       bg: '#FEE2E2', label: 'Failed' },
  PENDING_REVIEW:    { color: AMBER,     bg: '#FEF3C7', label: 'Pending Review' },
  IN_REVIEW:         { color: '#3B82F6', bg: '#EBF4FF', label: 'In Review' },
  PENDING_APPROVAL:  { color: '#8B5CF6', bg: '#F5F3FF', label: 'Pending Approval' },
  APPROVED:          { color: OLIVE,     bg: '#F0FDF4', label: 'Approved' },
  PUSHING_TO_XERO:   { color: '#0D7A6E', bg: '#E6F6F4', label: 'Pushing...' },
  XERO_POSTED:       { color: '#0D7A6E', bg: '#E6F6F4', label: 'Xero Posted' },
  XERO_AUTHORISED:   { color: '#166534', bg: '#DCFCE7', label: 'Authorised' },
  XERO_PAID:         { color: '#166534', bg: '#DCFCE7', label: 'Paid' },
  REJECTED:          { color: RED,       bg: '#FEE2E2', label: 'Rejected' },
  RETURNED:          { color: AMBER,     bg: '#FEF3C7', label: 'Returned' },
  XERO_PUSH_FAILED:  { color: RED,       bg: '#FEE2E2', label: 'Push Failed' },
  DELETED:           { color: '#94A3B8', bg: '#F1F5F9', label: 'Deleted' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ageDays = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

const initials = (name: string) =>
  name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

const avatarColor = (name: string) => {
  const colors = ['#E8960C', '#5B6B2D', '#3B82F6', '#8B5CF6', '#0D7A6E', '#F97316', '#64748B']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

type DateFilter = 'all' | '7d' | '30d' | 'this_month' | 'last_month' | 'this_year'

function getDateRange(f: DateFilter): { from: string | null; to: string | null; label: string } {
  const now = new Date()
  if (f === 'all') return { from: null, to: null, label: 'All Time' }
  if (f === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { from: d.toISOString(), to: now.toISOString(), label: 'Last 7 Days' }
  }
  if (f === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    return { from: d.toISOString(), to: now.toISOString(), label: 'Last 30 Days' }
  }
  if (f === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString(), to: now.toISOString(), label: 'This Month' }
  }
  if (f === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    return { from: from.toISOString(), to: to.toISOString(), label: 'Last Month' }
  }
  // this_year
  const from = new Date(now.getFullYear(), 0, 1)
  return { from: from.toISOString(), to: now.toISOString(), label: 'This Year' }
}

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

const SkeletonRow = () => (
  <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#EDE9E3', flexShrink: 0 }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ height: '12px', width: '55%', borderRadius: '4px', backgroundColor: '#EDE9E3' }} />
      <div style={{ height: '10px', width: '35%', borderRadius: '4px', backgroundColor: '#F3F0EB' }} />
    </div>
    <div style={{ width: '80px', height: '12px', borderRadius: '4px', backgroundColor: '#EDE9E3' }} />
    <div style={{ width: '70px', height: '14px', borderRadius: '4px', backgroundColor: '#EDE9E3' }} />
  </div>
)

export default function InvoicesPage() {
  const [invoices, setInvoices]               = useState<any[]>([])
  const [loading, setLoading]                 = useState(true)
  const [filter, setFilter]                   = useState('ALL')
  const [dateFilter, setDateFilter]           = useState<DateFilter>('all')
  const [showPushModal, setShowPushModal]     = useState(false)
  const [approvedInvoices, setApprovedInvoices] = useState<any[]>([])
  const [pushing, setPushing]                 = useState(false)
  const [pushResults, setPushResults]         = useState<Record<string, 'pending' | 'success' | 'error'>>({})
  const [pushDone, setPushDone]               = useState(false)
  const [deleteTarget, setDeleteTarget]       = useState<any>(null)
  const [deleteReason, setDeleteReason]       = useState('')
  const [deleting, setDeleting]               = useState(false)
  const [stuckCount, setStuckCount]           = useState(0)
  // invoice id -> 'running' | 'ok' | error message. Drives per-row re-extract UI.
  const [rescueState, setRescueState]         = useState<Record<string, 'running' | 'ok' | string>>({})
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchInvoices() }, [filter, dateFilter])

  // Poll stuck count every 30s so the header badge stays fresh even when the
  // user leaves the tab open. The query is a narrow COUNT so it's cheap.
  useEffect(() => {
    refreshStuckCount()
    const id = setInterval(refreshStuckCount, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshStuckCount = async () => {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60000).toISOString()
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'INGESTED')
      .lte('created_at', cutoff)
    setStuckCount(count ?? 0)
  }

  const fetchInvoices = async () => {
    setLoading(true)
    const { from, to } = getDateRange(dateFilter)
    let query = supabase
      .from('invoices')
      .select('id, status, supplier_name, invoice_number, invoice_date, due_date, amount_incl, created_at, source')
      .order('created_at', { ascending: false })
      .limit(500)
    if (filter === 'DELETED') query = query.eq('status', 'DELETED')
    else if (filter === 'STUCK') {
      const cutoff = new Date(Date.now() - STALE_MINUTES * 60000).toISOString()
      query = query.eq('status', 'INGESTED').lte('created_at', cutoff)
    }
    else if (filter !== 'ALL') query = query.eq('status', filter)
    else query = query.neq('status', 'DELETED')
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)
    const { data } = await query
    setInvoices(data ?? [])
    setLoading(false)
    refreshStuckCount()
  }

  const handleReextract = async (invoiceId: string) => {
    setRescueState((s) => ({ ...s, [invoiceId]: 'running' }))
    try {
      const res = await fetch('/api/invoices/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRescueState((s) => ({ ...s, [invoiceId]: json.error ?? `HTTP ${res.status}` }))
        return
      }
      setRescueState((s) => ({ ...s, [invoiceId]: 'ok' }))
      // Give the extractor a moment to flip the status, then refresh the list.
      setTimeout(() => fetchInvoices(), 1200)
    } catch (err: any) {
      setRescueState((s) => ({ ...s, [invoiceId]: err?.message ?? 'failed' }))
    }
  }

  const openPushModal = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, supplier_name, amount_incl, invoice_date')
      .eq('status', 'APPROVED')
      .order('created_at')
    setApprovedInvoices(data ?? [])
    setPushResults({})
    setPushDone(false)
    setShowPushModal(true)
  }

  const handleBatchPush = async () => {
    if (approvedInvoices.length === 0) return
    setPushing(true)
    const initial: Record<string, 'pending' | 'success' | 'error'> = {}
    approvedInvoices.forEach(inv => { initial[inv.id] = 'pending' })
    setPushResults(initial)
    for (const inv of approvedInvoices) {
      try {
        const res  = await fetch('/api/xero/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id }) })
        const data = await res.json()
        setPushResults(prev => ({ ...prev, [inv.id]: data.success ? 'success' : 'error' }))
      } catch {
        setPushResults(prev => ({ ...prev, [inv.id]: 'error' }))
      }
    }
    setPushing(false)
    setPushDone(true)
    fetchInvoices()
  }

  const handleDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return
    setDeleting(true)
    const user = (await supabase.auth.getUser()).data.user
    // Soft delete — set status to DELETED
    await supabase.from('invoices').update({ status: 'DELETED' }).eq('id', deleteTarget.id)
    await supabase.from('audit_trail').insert({
      invoice_id: deleteTarget.id,
      from_status: deleteTarget.status,
      to_status: 'DELETED',
      actor_email: user?.email,
      notes: `Deleted: ${deleteReason.trim()}`,
    })
    setDeleting(false)
    setDeleteTarget(null)
    setDeleteReason('')
    fetchInvoices()
  }

  const approvedCount = invoices.filter(i => i.status === 'APPROVED').length
  const totalValue = invoices.reduce((sum, inv) => sum + (Number(inv.amount_incl) || 0), 0)

  const FILTERS = [
    { value: 'ALL',              label: 'All' },
    { value: 'STUCK',            label: stuckCount > 0 ? `Stuck · ${stuckCount}` : 'Stuck' },
    { value: 'PENDING_REVIEW',   label: 'Pending Review' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED',         label: 'Approved' },
    { value: 'XERO_POSTED',      label: 'Xero Posted' },
    { value: 'XERO_PAID',        label: 'Paid' },
    { value: 'REJECTED',         label: 'Rejected' },
    { value: 'DELETED',          label: 'Deleted' },
  ]

  const DATE_FILTERS: { value: DateFilter; label: string }[] = [
    { value: 'all',        label: 'All Time' },
    { value: '7d',         label: '7 Days' },
    { value: '30d',        label: '30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year',  label: 'This Year' },
  ]

  return (
    <AppShell>
      <div style={{ maxWidth: '1200px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: 0 }}>Invoices</h1>
              {stuckCount > 0 && (
                <button
                  onClick={() => setFilter('STUCK')}
                  title={`${stuckCount} invoice${stuckCount === 1 ? '' : 's'} stuck in extraction — click to view`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '3px 10px', borderRadius: '999px',
                    backgroundColor: '#FEE2E2', color: RED,
                    border: `1px solid ${RED}22`,
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: RED }} />
                  {stuckCount} stuck
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              {filter !== 'ALL' ? ` · ${filter === 'STUCK' ? 'Stuck in extraction' : STATUS_STYLES[filter]?.label}` : ''}
              {' · '}{fmt(totalValue)}
            </p>
          </div>
          {approvedCount > 0 && (
            <button onClick={openPushModal} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#13B5EA', color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Push to Xero ({approvedCount})
            </button>
          )}
        </div>

        {/* Totals bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: invoices.length, amount: totalValue, color: DARK },
            { label: 'Review', value: invoices.filter(i => ['PENDING_REVIEW','IN_REVIEW','RETURNED'].includes(i.status)).length, amount: invoices.filter(i => ['PENDING_REVIEW','IN_REVIEW','RETURNED'].includes(i.status)).reduce((s, i) => s + (Number(i.amount_incl) || 0), 0), color: AMBER },
            { label: 'Approval', value: invoices.filter(i => i.status === 'PENDING_APPROVAL').length, amount: invoices.filter(i => i.status === 'PENDING_APPROVAL').reduce((s, i) => s + (Number(i.amount_incl) || 0), 0), color: '#8B5CF6' },
            { label: 'Posted', value: invoices.filter(i => ['XERO_POSTED','XERO_AUTHORISED','XERO_PAID'].includes(i.status)).length, amount: invoices.filter(i => ['XERO_POSTED','XERO_AUTHORISED','XERO_PAID'].includes(i.status)).reduce((s, i) => s + (Number(i.amount_incl) || 0), 0), color: '#0D7A6E' },
          ].map(t => (
            <div key={t.label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '10px 14px', flex: 1, minWidth: isMobile ? '45%' : '120px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{t.label}</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: t.color }}>{t.value}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>{fmt(t.amount)}</div>
            </div>
          ))}
        </div>

        {/* Status Filters */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
              border: filter === f.value ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`,
              backgroundColor: filter === f.value ? AMBER : WHITE,
              color: filter === f.value ? WHITE : MUTED,
              fontWeight: filter === f.value ? '700' : '400', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {DATE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setDateFilter(f.value)} style={{
              padding: '4px 10px', borderRadius: '14px', fontSize: '11px',
              border: dateFilter === f.value ? `1.5px solid ${OLIVE}` : `1px solid ${BORDER}`,
              backgroundColor: dateFilter === f.value ? OLIVE : WHITE,
              color: dateFilter === f.value ? WHITE : MUTED,
              fontWeight: dateFilter === f.value ? '600' : '400', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: isMobile ? 'auto' : 'hidden' }}>
          {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 150px 100px 100px 160px 36px', padding: '10px 20px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
              {['', 'Supplier / Invoice', 'Status', 'Invoice Date', 'Amount', 'Timing', ''].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : invoices.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No invoices found.</div>
          ) : (
            invoices.map((inv, i) => {
              const statusStyle = STATUS_STYLES[inv.status] ?? STATUS_STYLES['INGESTED']
              const receivedAge   = ageDays(inv.created_at)
              const isHighValue   = Number(inv.amount_incl) >= 10000
              const isOverdue     = inv.due_date && new Date(inv.due_date) < new Date() && !['XERO_PAID', 'XERO_POSTED', 'XERO_AUTHORISED', 'REJECTED'].includes(inv.status)
              const receivedColor = receivedAge <= 3 ? OLIVE : receivedAge <= 7 ? AMBER : RED
              const dueDays       = inv.due_date ? Math.floor((new Date(inv.due_date).getTime() - Date.now()) / 86400000) : null
              const invoiceAge    = inv.invoice_date ? ageDays(inv.invoice_date) : null
              const supplierName = inv.supplier_name ?? 'Unknown'
              const color       = avatarColor(supplierName)
              const stuck        = isStuck(inv)
              const rescue       = rescueState[inv.id]

              return (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                  <Link href={`/invoices/${inv.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                    {isMobile ? (
                      /* MOBILE ROW */
                      <div style={{ padding: '12px 14px', borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none', borderLeft: stuck ? `3px solid ${RED}` : isHighValue ? `3px solid ${AMBER}` : isOverdue ? `3px solid ${RED}` : '3px solid transparent', cursor: 'pointer', backgroundColor: stuck ? '#FEF7F7' : WHITE, display: 'flex', alignItems: 'center', gap: '10px' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = stuck ? '#FDECEC' : LIGHT)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = stuck ? '#FEF7F7' : WHITE)}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{initials(supplierName)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{supplierName}</span>
                            {stuck       && <span style={{ fontSize: '9px', fontWeight: '700', color: RED,   backgroundColor: '#FEE2E2', padding: '1px 5px', borderRadius: '3px' }}>⚠ STUCK</span>}
                            {isHighValue && <span style={{ fontSize: '9px', fontWeight: '700', color: AMBER, backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '3px' }}>HIGH VALUE</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: MUTED }}>
                            {stuck ? `Waiting for extraction · ${ageMinutes(inv.created_at)}m` : (inv.invoice_number ?? '—')}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontSize: '10px', fontWeight: '600', marginBottom: '3px', whiteSpace: 'nowrap' }}>{statusStyle.label}</span>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: isHighValue ? AMBER : DARK }}>{fmt(inv.amount_incl)}</div>
                        </div>
                      </div>
                    ) : (
                      /* DESKTOP ROW */
                      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 150px 100px 100px 160px', padding: '12px 20px', borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none', borderLeft: stuck ? `3px solid ${RED}` : isHighValue ? `3px solid ${AMBER}` : isOverdue ? `3px solid ${RED}` : '3px solid transparent', cursor: 'pointer', backgroundColor: stuck ? '#FEF7F7' : WHITE, alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = stuck ? '#FDECEC' : LIGHT)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = stuck ? '#FEF7F7' : WHITE)}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{initials(supplierName)}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{supplierName}</span>
                            {stuck      && <span title="Extraction never completed — click Re-extract" style={{ fontSize: '9px', fontWeight: '700', color: RED,   backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.03em' }}>⚠ STUCK</span>}
                            {isHighValue && <span style={{ fontSize: '9px', fontWeight: '700', color: AMBER, backgroundColor: '#FEF3C7', padding: '1px 6px', borderRadius: '4px' }}>HIGH VALUE</span>}
                            {isOverdue  && <span style={{ fontSize: '9px', fontWeight: '700', color: RED,   backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>OVERDUE</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                            {stuck ? `Waiting for extraction · ${ageMinutes(inv.created_at)}m` : (inv.invoice_number ?? 'No invoice number')}
                          </div>
                        </div>
                        <div><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontSize: '11px', fontWeight: '600' }}>{statusStyle.label}</span></div>
                        <div style={{ fontSize: '12px', color: DARK }}>{fmtDate(inv.invoice_date)}</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: isHighValue ? AMBER : DARK }}>{fmt(inv.amount_incl)}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: receivedColor }}>{'Rcvd: '}{receivedAge === 0 ? 'today' : receivedAge === 1 ? '1 day ago' : `${receivedAge}d ago`}</span>
                          {dueDays !== null ? (
                            <span style={{ fontSize: '11px', fontWeight: '600', color: dueDays < 0 ? RED : dueDays <= 7 ? AMBER : MUTED }}>{dueDays < 0 ? `Due: ${Math.abs(dueDays)}d overdue` : dueDays === 0 ? 'Due: today' : `Due: ${dueDays}d`}</span>
                          ) : invoiceAge !== null ? (
                            <span style={{ fontSize: '11px', color: MUTED }}>{'Inv: '}{invoiceAge === 0 ? 'today' : `${invoiceAge}d old`}</span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </Link>
                  {/* Row actions */}
                  {stuck && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReextract(inv.id) }}
                      disabled={rescue === 'running'}
                      title={
                        rescue === 'ok'      ? 'Queued — refreshing…'
                      : rescue === 'running' ? 'Re-extracting…'
                      : rescue               ? `Failed: ${rescue}`
                      :                        'Extraction never finished — click to retry'
                      }
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        padding: isMobile ? '6px 8px' : '6px 10px',
                        marginRight: isMobile ? '8px' : 0,
                        borderRadius: '6px', border: 'none',
                        backgroundColor: rescue === 'running' ? '#F3F0EB' : rescue === 'ok' ? OLIVE : RED,
                        color: rescue === 'running' ? MUTED : WHITE,
                        fontSize: '11px', fontWeight: 700, cursor: rescue === 'running' ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {rescue === 'ok' ? '✓' : rescue === 'running' ? '…' : '↻'}
                      {!isMobile && <span>{rescue === 'ok' ? 'Queued' : rescue === 'running' ? 'Retrying' : 'Re-extract'}</span>}
                    </button>
                  )}
                  {/* Delete button */}
                  {!stuck && !isMobile && !['XERO_POSTED', 'XERO_AUTHORISED', 'XERO_PAID'].includes(inv.status) && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(inv); setDeleteReason('') }}
                      style={{ width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '14px', flexShrink: 0, borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = RED)}
                      onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
                      title="Delete invoice"
                    >
                      🗑
                    </button>
                  )}
                  {!stuck && !isMobile && ['XERO_POSTED', 'XERO_AUTHORISED', 'XERO_PAID'].includes(inv.status) && (
                    <div style={{ width: '36px', flexShrink: 0, borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none' }} />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div onClick={() => !deleting && setDeleteTarget(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: WHITE, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: RED, margin: 0 }}>Delete Invoice</h2>
              {!deleting && <button onClick={() => setDeleteTarget(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer' }}>x</button>}
            </div>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '16px' }}>
              This will permanently delete <strong style={{ color: DARK }}>{deleteTarget.supplier_name ?? 'Unknown'}</strong> — {deleteTarget.invoice_number ?? '—'} ({fmt(deleteTarget.amount_incl)}).
            </p>

            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Reason for deletion *</label>
            <textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              placeholder="e.g. Duplicate invoice, test data, wrong document..."
              rows={3}
              style={{ width: '100%', padding: '10px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif', marginBottom: '16px' }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting || !deleteReason.trim()} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: !deleteReason.trim() ? '#F3F0EB' : RED, color: !deleteReason.trim() ? MUTED : WHITE, fontSize: '13px', fontWeight: '700', cursor: deleteReason.trim() ? 'pointer' : 'not-allowed' }}>
                {deleting ? 'Deleting...' : 'Delete Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Modal */}
      {showPushModal && (
        <div onClick={() => !pushing && setShowPushModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: WHITE, borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: DARK, margin: 0 }}>Push to Xero</h2>
              {!pushing && <button onClick={() => setShowPushModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer' }}>x</button>}
            </div>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>The following approved invoices will be submitted to Xero as draft bills:</p>

            <div style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 32px', padding: '8px 14px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                {['Supplier', 'Invoice #', 'Amount', ''].map(h => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>
              {approvedInvoices.map((inv, i) => {
                const result = pushResults[inv.id]
                return (
                  <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 32px', padding: '10px 14px', borderBottom: i < approvedInvoices.length - 1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: DARK, fontWeight: '500' }}>{inv.supplier_name ?? '—'}</div>
                    <div style={{ fontSize: '12px', color: MUTED }}>{inv.invoice_number ?? '—'}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{fmt(inv.amount_incl)}</div>
                    <div style={{ fontSize: '16px', textAlign: 'center' }}>
                      {result === 'pending' && <span style={{ color: AMBER }}>&#x27F3;</span>}
                      {result === 'success' && <span style={{ color: OLIVE }}>&#x2713;</span>}
                      {result === 'error'   && <span style={{ color: RED }}>&#x2717;</span>}
                      {!result             && <span style={{ color: MUTED }}>&middot;</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: LIGHT, borderRadius: '7px', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{approvedInvoices.length} invoice{approvedInvoices.length !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>{fmt(approvedInvoices.reduce((sum, inv) => sum + (Number(inv.amount_incl) || 0), 0))}</span>
            </div>

            {pushDone ? (
              <button onClick={() => setShowPushModal(false)} style={{ width: '100%', padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>Done</button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowPushModal(false)} disabled={pushing} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleBatchPush} disabled={pushing} style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: pushing ? '#94A3B8' : '#13B5EA', color: WHITE, fontSize: '14px', fontWeight: '700', cursor: pushing ? 'not-allowed' : 'pointer' }}>
                  {pushing ? 'Pushing to Xero...' : `Submit ${approvedInvoices.length} Invoice${approvedInvoices.length !== 1 ? 's' : ''} to Xero`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
