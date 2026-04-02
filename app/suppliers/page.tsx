'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

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

export default function SuppliersPage() {
  const isMobile = useIsMobile()
  const [suppliers, setSuppliers]   = useState<any[]>([])
  const [stats, setStats]           = useState<Record<string, any>>({})
  const [glCodes, setGlCodes]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState<any>(null)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: suppData }, { data: glData }, { data: invoiceData }] = await Promise.all([
      supabase.from('suppliers').select('*, gl_codes(id, xero_account_code, name), supplier_statement_configs(id, trained_at, trained_by)').eq('is_active', true).order('name'),
      supabase.from('gl_codes').select('id, xero_account_code, name').eq('is_active', true).order('xero_account_code'),
      supabase.from('invoices').select('supplier_id, amount_incl, status, created_at').not('supplier_id', 'is', null),
    ])

    // Build stats per supplier
    const statsMap: Record<string, any> = {}
    ;(invoiceData ?? []).forEach((inv: any) => {
      if (!inv.supplier_id) return
      if (!statsMap[inv.supplier_id]) statsMap[inv.supplier_id] = { count: 0, total: 0, lastDate: null, pending: 0 }
      statsMap[inv.supplier_id].count++
      statsMap[inv.supplier_id].total += Number(inv.amount_incl) || 0
      if (!statsMap[inv.supplier_id].lastDate || inv.created_at > statsMap[inv.supplier_id].lastDate) {
        statsMap[inv.supplier_id].lastDate = inv.created_at
      }
      if (['PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL'].includes(inv.status)) {
        statsMap[inv.supplier_id].pending++
      }
    })

    setSuppliers(suppData ?? [])
    setStats(statsMap)
    setGlCodes(glData ?? [])
    setLoading(false)
  }

  const saveDefaultGl = async (supplierId: string, glCodeId: string) => {
    setSaving(true)
    setSaveMsg('')
    await supabase.from('suppliers').update({ default_gl_code_id: glCodeId || null }).eq('id', supplierId)
    setSaveMsg('Saved')
    setTimeout(() => setSaveMsg(''), 2000)
    setSaving(false)
    fetchData()
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.vat_number && s.vat_number.includes(search))
  )

  // Summary stats
  const totalSuppliers  = suppliers.length
  const activeSuppliers = suppliers.filter(s => stats[s.id]?.count > 0).length
  const totalValue      = Object.values(stats).reduce((sum: number, s: any) => sum + (s.total || 0), 0)
  const pendingCount    = Object.values(stats).reduce((sum: number, s: any) => sum + (s.pending || 0), 0)

  const PanelContent = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: avatarColor(selected!.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
          {initials(selected!.name)}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{selected!.name}</div>
          {selected!.email && <div style={{ fontSize: '11px', color: MUTED }}>{selected!.email}</div>}
        </div>
      </div>
      {[
        { label: 'VAT Number',     value: selected!.vat_number ?? '—' },
        { label: 'Xero Contact',   value: selected!.xero_contact_id?.slice(0, 8) + '...' },
        { label: 'Total Invoices', value: stats[selected!.id]?.count ?? 0 },
        { label: 'Total Value',    value: fmt(stats[selected!.id]?.total ?? 0) },
        { label: 'Last Invoice',   value: fmtDate(stats[selected!.id]?.lastDate) },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: MUTED }}>{label}</span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: DARK }}>{String(value)}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${BORDER}`, margin: '14px 0' }} />
      <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Default GL Code</div>
      <select
        defaultValue={selected!.default_gl_code_id ?? ''}
        onChange={e => saveDefaultGl(selected!.id, e.target.value)}
        disabled={saving}
        style={{ width: '100%', padding: '8px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', backgroundColor: WHITE, color: DARK, marginBottom: '8px' }}
      >
        <option value="">— No default —</option>
        {glCodes.map(g => (
          <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>
        ))}
      </select>
      {saveMsg && <div style={{ fontSize: '12px', color: OLIVE, fontWeight: '600' }}>✓ {saveMsg}</div>}
      <div style={{ marginTop: '12px', padding: '10px', backgroundColor: LIGHT, borderRadius: '6px', fontSize: '11px', color: MUTED, lineHeight: 1.5 }}>
        The default GL code is suggested automatically during OCR extraction for invoices from this supplier.
      </div>
      {/* Statement Config */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Statement Config
        </div>
        {selected.supplier_statement_configs?.length > 0 ? (
          <div style={{ fontSize: '13px', color: OLIVE, marginBottom: '10px' }}>
            Configured {new Date(selected.supplier_statement_configs[0].trained_at).toLocaleDateString('en-ZA')}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: MUTED, marginBottom: '10px' }}>
            Not configured
          </div>
        )}
        <Link
          href={`/suppliers/${selected.id}/statement-config`}
          style={{
            display: 'inline-block',
            fontSize: '12px',
            color: '#E8960C',
            fontWeight: '600',
            textDecoration: 'none',
            padding: '6px 12px',
            border: '1px solid #E8960C',
            borderRadius: '6px',
          }}
        >
          {selected.supplier_statement_configs?.length > 0 ? 'Reconfigure' : 'Configure Statement'}
        </Link>
      </div>
    </>
  )

  return (
    <AppShell>
      {/* Mobile modal */}
      {selected && isMobile && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', backgroundColor: WHITE, borderRadius: '16px 16px 0 0', padding: '20px 20px 40px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: BORDER, borderRadius: '2px', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: DARK, margin: 0 }}>Supplier Detail</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '22px', color: MUTED, cursor: 'pointer' }}>×</button>
            </div>
            <PanelContent />
          </div>
        </div>
      )}

      <div style={{ maxWidth: '1300px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px' }}>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Suppliers</h1>
              <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Synced from Xero · {totalSuppliers} suppliers</p>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or VAT..."
              style={{ padding: '8px 14px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, fontSize: '13px', color: DARK, backgroundColor: WHITE, width: isMobile ? '140px' : '220px', outline: 'none' }} />
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Total Suppliers',       value: totalSuppliers,  color: DARK,      bg: LIGHT },
              { label: 'With Invoices',          value: activeSuppliers, color: OLIVE,     bg: '#F0FDF4' },
              { label: 'Total Value Processed',  value: fmt(totalValue), color: AMBER,     bg: '#FEF3C7' },
              { label: 'Invoices in Pipeline',   value: pendingCount,    color: '#8B5CF6', bg: '#F5F3FF' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 14px' }}>
                <div style={{ display: 'inline-block', backgroundColor: bg, borderRadius: '4px', padding: '2px 7px', fontSize: '9px', fontWeight: '600', color, marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 'bold', color: DARK }}>{loading ? '—' : value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '36px 1fr 55px' : '36px 1fr 120px 80px 110px 110px 180px', padding: '10px 14px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
              {(isMobile ? ['', 'Supplier', 'Inv'] : ['', 'Supplier', 'VAT Number', 'Invoices', 'Total Value', 'Last Invoice', 'Default GL Code']).map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No suppliers found.</div>
            ) : (
              filtered.map((s, i) => {
                const st    = stats[s.id] ?? {}
                const color = avatarColor(s.name)
                const isSelected = selected?.id === s.id
                return (
                  <div key={s.id} onClick={() => setSelected(isSelected ? null : s)}
                    style={{ display: 'grid', gridTemplateColumns: isMobile ? '36px 1fr 55px' : '36px 1fr 120px 80px 110px 110px 180px', padding: '12px 14px', borderBottom: i < filtered.length - 1 ? `1px solid ${LIGHT}` : 'none', cursor: 'pointer', alignItems: 'center', backgroundColor: isSelected && !isMobile ? '#FEF3C7' : WHITE, borderLeft: isSelected && !isMobile ? `3px solid ${AMBER}` : '3px solid transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = LIGHT }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = WHITE }}
                  >
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '9px', fontWeight: '700' }}>{initials(s.name)}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{s.name}</div>
                      {s.email && <div style={{ fontSize: '11px', color: MUTED, marginTop: '1px' }}>{s.email}</div>}
                    </div>
                    {!isMobile && <div style={{ fontSize: '12px', color: MUTED }}>{s.vat_number ?? '—'}</div>}
                    <div style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: '600', color: st.count > 0 ? DARK : MUTED }}>{st.count ?? 0}</div>
                    {!isMobile && <div style={{ fontSize: '12px', fontWeight: st.total > 0 ? '600' : '400', color: st.total > 0 ? DARK : MUTED }}>{st.total > 0 ? fmt(st.total) : '—'}</div>}
                    {!isMobile && <div style={{ fontSize: '11px', color: MUTED }}>{fmtDate(st.lastDate)}</div>}
                    {!isMobile && <div style={{ fontSize: '11px', color: s.gl_codes ? OLIVE : MUTED, fontWeight: s.gl_codes ? '500' : '400' }}>{s.gl_codes ? `${s.gl_codes.xero_account_code} · ${s.gl_codes.name}` : '— Not set'}</div>}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Desktop side panel */}
        {selected && !isMobile && (
          <div style={{ width: '280px', flexShrink: 0, position: 'sticky', top: '76px', alignSelf: 'flex-start' }}>
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: 0 }}>Supplier Detail</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '18px', color: MUTED, cursor: 'pointer' }}>×</button>
              </div>
              <PanelContent />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
