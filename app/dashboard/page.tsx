'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import WelcomePopup from '@/components/WelcomePopup'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtHours = (hours: number | null) => {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

const PIPELINE_STAGES = [
  { status: 'INGESTED',         label: 'Ingested',         color: '#64748B' },
  { status: 'EXTRACTING',       label: 'Extracting',       color: '#8B5CF6' },
  { status: 'PENDING_REVIEW',   label: 'Pending Review',   color: AMBER },
  { status: 'IN_REVIEW',        label: 'In Review',        color: '#3B82F6' },
  { status: 'PENDING_APPROVAL', label: 'Pending Approval', color: '#8B5CF6' },
  { status: 'APPROVED',         label: 'Approved',         color: OLIVE },
  { status: 'XERO_POSTED',      label: 'Xero Posted',      color: '#0D7A6E' },
  { status: 'XERO_PAID',        label: 'Paid',             color: '#166534' },
]

const AGE_BUCKETS = ['0–3d', '4–7d', '8–14d', '15–30d', '30+d']

type DateFilter = 'current_month' | 'last_month' | 'current_year' | 'last_year'

function getDateRange(filter: DateFilter) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()
  switch (filter) {
    case 'current_month': return { from: new Date(y, m, 1).toISOString(), to: new Date(y, m + 1, 0, 23, 59, 59).toISOString(), label: now.toLocaleString('en-ZA', { month: 'long', year: 'numeric' }) }
    case 'last_month':    return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 0, 23, 59, 59).toISOString(), label: new Date(y, m - 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' }) }
    case 'current_year':  return { from: new Date(y, 0, 1).toISOString(), to: new Date(y, 11, 31, 23, 59, 59).toISOString(), label: `${y}` }
    case 'last_year':     return { from: new Date(y - 1, 0, 1).toISOString(), to: new Date(y - 1, 11, 31, 23, 59, 59).toISOString(), label: `${y - 1}` }
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => { const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check) }, [])
  return isMobile
}

export default function DashboardPage() {
  const [loading, setLoading]     = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>('current_month')
  const [kpis, setKpis]           = useState({ awaitingReview: 0, pendingApproval: 0, processedMTD: 0, rejected: 0, totalValueMTD: 0, avgProcessingHours: null as number | null })
  const [pipeline, setPipeline]   = useState<Record<string, number>>({})
  const [avgTimes, setAvgTimes]   = useState<{ stage: string; avgHours: number | null }[]>([])
  const [aging, setAging]         = useState<{ status: string; label: string; color: string; buckets: number[] }[]>([])
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => { fetchAll() }, [dateFilter])

  const { from, to, label: periodLabel } = getDateRange(dateFilter)

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchKpis(), fetchPipeline(), fetchAvgTimes(), fetchAging()])
    setLoading(false)
  }

  const fetchKpis = async () => {
    const [{ count: review }, { count: approval }, { count: processed }, { count: rejected }, { data: valueData }, { data: avgData }] = await Promise.all([
      supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED']),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['APPROVED', 'XERO_POSTED', 'XERO_PAID']).gte('created_at', from).lte('created_at', to),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'REJECTED').gte('created_at', from).lte('created_at', to),
      supabase.from('invoices').select('amount_incl').in('status', ['APPROVED', 'XERO_POSTED', 'XERO_PAID']).gte('created_at', from).lte('created_at', to),
      supabase.from('invoices').select('created_at, updated_at').in('status', ['APPROVED', 'XERO_POSTED', 'XERO_PAID']).gte('created_at', from).lte('created_at', to),
    ])
    const totalValue = (valueData ?? []).reduce((sum, inv) => sum + (Number(inv.amount_incl) || 0), 0)
    const avgHours = avgData && avgData.length > 0 ? avgData.reduce((sum, inv) => sum + (new Date(inv.updated_at).getTime() - new Date(inv.created_at).getTime()) / 3600000, 0) / avgData.length : null
    setKpis({ awaitingReview: review ?? 0, pendingApproval: approval ?? 0, processedMTD: processed ?? 0, rejected: rejected ?? 0, totalValueMTD: totalValue, avgProcessingHours: avgHours })
  }

  const fetchPipeline = async () => {
    const { data } = await supabase.from('invoices').select('status').gte('created_at', from).lte('created_at', to)
    const counts: Record<string, number> = {}
    ;(data ?? []).forEach(inv => { counts[inv.status] = (counts[inv.status] || 0) + 1 })
    setPipeline(counts)
  }

  const fetchAvgTimes = async () => {
    const { data: audit } = await supabase.from('audit_trail').select('invoice_id, from_status, to_status, created_at').gte('created_at', from).lte('created_at', to).order('created_at')
    if (!audit || audit.length === 0) { setAvgTimes([]); return }
    const byInvoice: Record<string, any[]> = {}
    audit.forEach(e => { if (!byInvoice[e.invoice_id]) byInvoice[e.invoice_id] = []; byInvoice[e.invoice_id].push(e) })
    const stageTimes: Record<string, number[]> = {}
    Object.values(byInvoice).forEach(entries => {
      for (let i = 0; i < entries.length - 1; i++) {
        const status = entries[i].to_status
        const duration = (new Date(entries[i + 1].created_at).getTime() - new Date(entries[i].created_at).getTime()) / 3600000
        if (duration > 0 && duration < 720) { if (!stageTimes[status]) stageTimes[status] = []; stageTimes[status].push(duration) }
      }
    })
    setAvgTimes(['INGESTED', 'EXTRACTING', 'PENDING_REVIEW', 'PENDING_APPROVAL'].map(s => ({ stage: s, avgHours: stageTimes[s]?.length > 0 ? stageTimes[s].reduce((a, b) => a + b, 0) / stageTimes[s].length : null })))
  }

  const fetchAging = async () => {
    const now = new Date()
    const { data } = await supabase.from('invoices').select('status, created_at').in('status', ['PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL', 'RETURNED'])
    const stageMap: Record<string, number[]> = { PENDING_REVIEW: [0,0,0,0,0], IN_REVIEW: [0,0,0,0,0], PENDING_APPROVAL: [0,0,0,0,0], RETURNED: [0,0,0,0,0] }
    ;(data ?? []).forEach(inv => {
      const ageDays = (now.getTime() - new Date(inv.created_at).getTime()) / 86400000
      const bucket = ageDays <= 3 ? 0 : ageDays <= 7 ? 1 : ageDays <= 14 ? 2 : ageDays <= 30 ? 3 : 4
      if (stageMap[inv.status]) stageMap[inv.status][bucket]++
    })
    setAging([
      { status: 'PENDING_REVIEW',   label: 'Pending Review',   color: AMBER,     buckets: stageMap['PENDING_REVIEW'] },
      { status: 'IN_REVIEW',        label: 'In Review',        color: '#3B82F6', buckets: stageMap['IN_REVIEW'] },
      { status: 'PENDING_APPROVAL', label: 'Pending Approval', color: '#8B5CF6', buckets: stageMap['PENDING_APPROVAL'] },
      { status: 'RETURNED',         label: 'Returned',         color: '#F97316', buckets: stageMap['RETURNED'] },
    ])
  }

  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => pipeline[s.status] || 0), 1)
  const totalAging  = aging.reduce((sum, s) => sum + s.buckets.reduce((a, b) => a + b, 0), 0)

  const DATE_FILTERS: { value: DateFilter; label: string }[] = [
    { value: 'current_month', label: 'This Month' },
    { value: 'last_month',    label: 'Last Month' },
    { value: 'current_year',  label: 'This Year' },
    { value: 'last_year',     label: 'Last Year' },
  ]

  const kpiCards = [
    { label: 'Awaiting Review',     value: kpis.awaitingReview,              color: AMBER,     bg: '#FEF3C7', link: '/review',   note: 'live' },
    { label: 'Pending Approval',    value: kpis.pendingApproval,             color: '#8B5CF6', bg: '#F5F3FF', link: '/approve',  note: 'live' },
    { label: 'Processed',           value: kpis.processedMTD,               color: OLIVE,     bg: '#F0FDF4', link: '/invoices', note: periodLabel },
    { label: 'Rejected',            value: kpis.rejected,                   color: '#EF4444', bg: '#FEE2E2', link: '/invoices', note: periodLabel },
    { label: 'Value Processed',     value: fmt(kpis.totalValueMTD),         color: DARK,      bg: LIGHT,     link: null,        note: periodLabel },
    { label: 'Avg Process Time',    value: fmtHours(kpis.avgProcessingHours), color: '#3B82F6', bg: '#EBF4FF', link: null,      note: periodLabel },
  ]

  return (
    <AppShell>
      <WelcomePopup />
      <div style={{ maxWidth: '1300px' }}>
        {/* Header + date filter */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', marginBottom: '16px', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 'bold', color: DARK, margin: '0 0 2px' }}>Dashboard</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Showing data for <strong style={{ color: DARK }}>{periodLabel}</strong></p>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DATE_FILTERS.map(f => (
              <button key={f.value} onClick={() => setDateFilter(f.value)} suppressHydrationWarning style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: dateFilter === f.value ? '700' : '400', border: dateFilter === f.value ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`, backgroundColor: dateFilter === f.value ? AMBER : WHITE, color: dateFilter === f.value ? WHITE : MUTED, cursor: 'pointer' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards — 2 cols on mobile, 3 on tablet, 6 on desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {kpiCards.map(({ label, value, color, bg, link, note }) => (
            <div key={label} onClick={() => link && (window.location.href = link)} style={{ backgroundColor: WHITE, borderRadius: '8px', padding: isMobile ? '10px 12px' : '14px', border: `1px solid ${BORDER}`, cursor: link ? 'pointer' : 'default' }}>
              <div style={{ display: 'inline-block', backgroundColor: bg, borderRadius: '4px', padding: '2px 6px', fontSize: '9px', fontWeight: '600', color, marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: DARK, marginBottom: '1px' }}>{loading ? '—' : value}</div>
              <div style={{ fontSize: '10px', color: MUTED }}>{note}</div>
            </div>
          ))}
        </div>

        {/* Pipeline */}
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '11px', fontWeight: '600', color: MUTED, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pipeline Flow — {periodLabel}</h2>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {PIPELINE_STAGES.map((stage) => {
                const count = pipeline[stage.status] || 0
                const maxCount = Math.max(...PIPELINE_STAGES.map(s => pipeline[s.status] || 0), 1)
                const barWidth = count > 0 ? Math.max((count / maxCount) * 100, 8) : 0
                return (
                  <div key={stage.status} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '11px', color: count > 0 ? stage.color : MUTED, width: '110px', flexShrink: 0, fontWeight: count > 0 ? '600' : '400' }}>{stage.label}</div>
                    <div style={{ flex: 1, height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                      {barWidth > 0 && <div style={{ height: '100%', width: `${barWidth}%`, backgroundColor: stage.color, borderRadius: '4px' }} />}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: count > 0 ? stage.color : '#CBD5E1', width: '24px', textAlign: 'right' }}>{loading ? '—' : count}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              {PIPELINE_STAGES.map((stage, i) => {
                const count = pipeline[stage.status] || 0
                const barHeight = Math.max((count / maxPipeline) * 80, count > 0 ? 10 : 4)
                return (
                  <div key={stage.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: count > 0 ? stage.color : '#CBD5E1', marginBottom: '4px' }}>{loading ? '—' : count}</div>
                    <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '84px', position: 'relative' }}>
                      <div style={{ width: '65%', height: `${barHeight}px`, backgroundColor: count > 0 ? stage.color : '#E2E8F0', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
                      {i < PIPELINE_STAGES.length - 1 && <div style={{ position: 'absolute', right: '-6px', bottom: '0px', fontSize: '16px', color: '#CBD5E1', lineHeight: 1, zIndex: 1 }}>›</div>}
                    </div>
                    <div style={{ width: '100%', textAlign: 'center', padding: '6px 2px 0', borderTop: `2px solid ${count > 0 ? stage.color : '#E2E8F0'}` }}>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: count > 0 ? stage.color : MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.4 }}>{stage.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom panels — stack on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
          {/* Avg time */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
            <h2 style={{ fontSize: '11px', fontWeight: '600', color: MUTED, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Time per Stage — {periodLabel}</h2>
            {loading ? <div style={{ color: MUTED, fontSize: '13px' }}>Loading...</div> :
             avgTimes.every(t => t.avgHours == null) ? <div style={{ color: MUTED, fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Not enough data yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[{ stage: 'INGESTED', label: 'Ingestion → Extraction', color: '#64748B' }, { stage: 'EXTRACTING', label: 'Extraction → Review', color: '#8B5CF6' }, { stage: 'PENDING_REVIEW', label: 'Review → Approval', color: AMBER }, { stage: 'PENDING_APPROVAL', label: 'Approval → Approved', color: OLIVE }].map(({ stage, label, color }) => {
                  const entry = avgTimes.find(t => t.stage === stage)
                  const hours = entry?.avgHours ?? null
                  const barWidth = hours != null ? Math.min((hours / 48) * 100, 100) : 0
                  return (
                    <div key={stage}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', color: DARK }}>{label}</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color }}>{fmtHours(hours)}</span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barWidth}%`, backgroundColor: color, borderRadius: '3px' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Aging */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
            <h2 style={{ fontSize: '11px', fontWeight: '600', color: MUTED, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invoice Aging — Live</h2>
            {loading ? <div style={{ color: MUTED, fontSize: '13px' }}>Loading...</div> :
             totalAging === 0 ? <div style={{ color: MUTED, fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No active invoices.</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  <div />
                  {AGE_BUCKETS.map(b => <div key={b} style={{ fontSize: '9px', fontWeight: '600', color: MUTED, textAlign: 'center', textTransform: 'uppercase' }}>{b}</div>)}
                </div>
                {aging.map(({ label, color, buckets }) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '110px repeat(5, 1fr)', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: DARK, fontWeight: '500' }}>{label}</div>
                    {buckets.map((count, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: count > 0 ? (i >= 3 ? '#FEE2E2' : i >= 1 ? '#FEF3C7' : '#F0FDF4') : LIGHT, color: count > 0 ? (i >= 3 ? '#EF4444' : i >= 1 ? AMBER : OLIVE) : '#CBD5E1', fontSize: '12px', fontWeight: count > 0 ? '700' : '400' }}>
                          {count || '·'}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
