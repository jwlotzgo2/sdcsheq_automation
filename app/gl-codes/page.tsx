'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  EXPENSE:      { color: '#EF4444', bg: '#FEE2E2' },
  REVENUE:      { color: OLIVE,     bg: '#F0FDF4' },
  DIRECTCOSTS:  { color: AMBER,     bg: '#FEF3C7' },
  ASSET:        { color: '#3B82F6', bg: '#EBF4FF' },
  LIABILITY:    { color: '#8B5CF6', bg: '#F5F3FF' },
  EQUITY:       { color: '#0D7A6E', bg: '#E6F6F4' },
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

export default function GlCodesPage() {
  const isMobile = useIsMobile()
  const [codes, setCodes]     = useState<any[]>([])
  const [usage, setUsage]     = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: glData }, { data: lineData }] = await Promise.all([
      supabase.from('gl_codes').select('*').eq('is_active', true).order('xero_account_code'),
      supabase.from('invoice_line_items').select('gl_code_id').not('gl_code_id', 'is', null),
    ])

    const usageMap: Record<string, number> = {}
    ;(lineData ?? []).forEach((l: any) => {
      usageMap[l.gl_code_id] = (usageMap[l.gl_code_id] || 0) + 1
    })

    setCodes(glData ?? [])
    setUsage(usageMap)
    setLoading(false)
  }

  const types = ['ALL', ...Array.from(new Set(codes.map(c => c.account_type).filter(Boolean)))]

  const filtered = codes.filter(c => {
    const matchSearch = c.xero_account_code.includes(search) || c.name.toLowerCase().includes(search.toLowerCase())
    const matchType   = typeFilter === 'ALL' || c.account_type === typeFilter
    return matchSearch && matchType
  })

  const totalUsage = Object.values(usage).reduce((a, b) => a + b, 0)
  const mostUsed   = codes.sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0)).slice(0, 1)[0]

  return (
    <AppShell>
      <div style={{ maxWidth: '1000px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>GL Codes</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Chart of accounts synced from Xero · {codes.length} codes</p>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search code or name..."
            style={{ padding: '8px 14px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, fontSize: '13px', color: DARK, backgroundColor: WHITE, width: '200px', outline: 'none' }}
          />
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total GL Codes',  value: codes.length,                                        color: DARK,  bg: LIGHT },
            { label: 'Codes in Use',    value: Object.keys(usage).length,                           color: OLIVE, bg: '#F0FDF4' },
            { label: 'Most Used Code',  value: mostUsed ? `${mostUsed.xero_account_code} · ${mostUsed.name}` : '—', color: AMBER, bg: '#FEF3C7' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
              <div style={{ display: 'inline-block', backgroundColor: bg, borderRadius: '5px', padding: '3px 8px', fontSize: '10px', fontWeight: '600', color, marginBottom: '8px' }}>{label}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: DARK }}>{loading ? '—' : value}</div>
            </div>
          ))}
        </div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: typeFilter === t ? '700' : '400',
              border: typeFilter === t ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`,
              backgroundColor: typeFilter === t ? AMBER : WHITE,
              color: typeFilter === t ? WHITE : MUTED, cursor: 'pointer',
            }}>
              {t === 'ALL' ? 'All Types' : t}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '60px 1fr 60px' : '80px 1fr 130px 80px 120px', padding: '10px 14px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
            {(isMobile ? ['Code', 'Name', 'Used'] : ['Code', 'Name', 'Type', 'Used', 'Usage Bar']).map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No GL codes found.</div>
          ) : (
            filtered.map((code, i) => {
              const count    = usage[code.id] || 0
              const maxUsage = Math.max(...Object.values(usage), 1)
              const barWidth = count > 0 ? Math.max((count / maxUsage) * 100, 4) : 0
              const typeStyle = TYPE_COLORS[code.account_type] ?? { color: MUTED, bg: LIGHT }
              return (
                <div key={code.id} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '60px 1fr 60px' : '80px 1fr 130px 80px 120px',
                  padding: '11px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${LIGHT}` : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: DARK, fontFamily: 'monospace' }}>{code.xero_account_code}</div>
                  <div>
                    <div style={{ fontSize: '13px', color: DARK }}>{code.name}</div>
                    {code.description && <div style={{ fontSize: '11px', color: MUTED, marginTop: '1px' }}>{code.description}</div>}
                  </div>
                  {!isMobile && <div>{code.account_type && (<span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', backgroundColor: typeStyle.bg, color: typeStyle.color, fontSize: '10px', fontWeight: '600' }}>{code.account_type}</span>)}</div>}
                  <div style={{ fontSize: '13px', fontWeight: count > 0 ? '700' : '400', color: count > 0 ? DARK : MUTED }}>{count > 0 ? count : '—'}</div>
                  {!isMobile && <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>{barWidth > 0 && <div style={{ height: '100%', width: `${barWidth}%`, backgroundColor: typeStyle.color, borderRadius: '3px' }} />}</div>}
                </div>
              )
            })
          )}
        </div>
      </div>
    </AppShell>
  )
}
