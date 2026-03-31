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
  const [showPushModal, setShowPushModal]     = useState(false)
  const [approvedInvoices, setApprovedInvoices] = useState<any[]>([])
  const [pushing, setPushing]                 = useState(false)
  const [pushResults, setPushResults]         = useState<Record<string, 'pending' | 'success' | 'error'>>({})
  const [pushDone, setPushDone]               = useState(false)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchInvoices() }, [filter])

  const fetchInvoices = async () => {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('id, status, supplier_name, invoice_number, invoice_date, due_date, amount_incl, created_at, source')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'ALL') query = query.eq('status', filter)
    const { data } = await query
    setInvoices(data ?? [])
    setLoading(false)
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

  const approvedCount = invoices.filter(i => i.status === 'APPROVED').length

  const FILTERS = [
    { value: 'ALL',              label: 'All' },
    { value: 'PENDING_REVIEW',   label: 'Pending Review' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED',         label: 'Approved' },
    { value: 'XERO_POSTED',      label: 'Xero Posted' },
    { value: 'REJECTED',         label: 'Rejected' },
  ]

  return (
    <AppShell>
      <div style={{ maxWidth: '1200px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Invoices</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              {filter !== 'ALL' ? ` · ${STATUS_STYLES[filter]?.label}` : ''}
            </p>
          </div>
          {approvedCount > 0 && (
            <button onClick={openPushModal} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#13B5EA', color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⬆ Push to Xero ({approvedCount})
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
              border: filter === f.value ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`,
              backgroundColor: filter === f.value ? AMBER : WHITE,
              color: filter === f.value ? WHITE : MUTED,
              fontWeight: filter === f.value ? '700' : '400', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: isMobile ? 'auto' : 'hidden' }}>
          {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 150px 100px 100px 160px', padding: '10px 20px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
              {['', 'Supplier / Invoice', 'Status', 'Invoice Date', 'Amount', 'Timing'].map(h => (
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

              return (
                <Link key={inv.id} href={`/invoices/${inv.id}`} style={{ textDecoration: 'none' }}>
                  {isMobile ? (
                    /* MOBILE ROW */
                    <div style={{ padding: '12px 14px', borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none', borderLeft: isHighValue ? `3px solid ${AMBER}` : isOverdue ? `3px solid ${RED}` : '3px solid transparent', cursor: 'pointer', backgroundColor: WHITE, display: 'flex', alignItems: 'center', gap: '10px' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = LIGHT)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = WHITE)}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{initials(supplierName)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{supplierName}</span>
                          {isHighValue && <span style={{ fontSize: '9px', fontWeight: '700', color: AMBER, backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '3px' }}>HIGH VALUE</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{inv.invoice_number ?? '—'}</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontSize: '10px', fontWeight: '600', marginBottom: '3px', whiteSpace: 'nowrap' }}>{statusStyle.label}</span>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: isHighValue ? AMBER : DARK }}>{fmt(inv.amount_incl)}</div>
                      </div>
                    </div>
                  ) : (
                    /* DESKTOP ROW */
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 150px 100px 100px 160px', padding: '12px 20px', borderBottom: i < invoices.length - 1 ? `1px solid #F1F5F9` : 'none', borderLeft: isHighValue ? `3px solid ${AMBER}` : isOverdue ? `3px solid ${RED}` : '3px solid transparent', cursor: 'pointer', backgroundColor: WHITE, alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = LIGHT)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = WHITE)}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{initials(supplierName)}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{supplierName}</span>
                          {isHighValue && <span style={{ fontSize: '9px', fontWeight: '700', color: AMBER, backgroundColor: '#FEF3C7', padding: '1px 6px', borderRadius: '4px' }}>HIGH VALUE</span>}
                          {isOverdue  && <span style={{ fontSize: '9px', fontWeight: '700', color: RED,   backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>OVERDUE</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{inv.invoice_number ?? 'No invoice number'}</div>
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
              )
            })
          )}
        </div>
      </div>

      {/* Push Modal */}
      {showPushModal && (
        <div onClick={() => !pushing && setShowPushModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: WHITE, borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '560px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: DARK, margin: 0 }}>Push to Xero</h2>
              {!pushing && <button onClick={() => setShowPushModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer' }}>×</button>}
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
                      {result === 'pending' && <span style={{ color: AMBER }}>⟳</span>}
                      {result === 'success' && <span style={{ color: OLIVE }}>✓</span>}
                      {result === 'error'   && <span style={{ color: RED }}>✗</span>}
                      {!result             && <span style={{ color: MUTED }}>·</span>}
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
