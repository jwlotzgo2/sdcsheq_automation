'use client'

import { useEffect, useState, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const TEAL   = '#13B5EA'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_REVIEW:   { label: 'Pending Review',   color: AMBER,     bg: '#FEF3C7' },
  PENDING_APPROVAL: { label: 'Pending Approval', color: '#8B5CF6', bg: '#F5F3FF' },
  APPROVED:         { label: 'Approved',          color: OLIVE,     bg: '#F0FDF4' },
  REJECTED:         { label: 'Rejected',          color: '#EF4444', bg: '#FEE2E2' },
  RETURNED:         { label: 'Returned',          color: AMBER,     bg: '#FEF3C7' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'
const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

const FilterBar = memo(function FilterBar({ filters, costCentres, onChange }: {
  filters: any; costCentres: any[]; onChange: (f: any) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
      <input type="date" value={filters.from} onChange={e => onChange({ ...filters, from: e.target.value })}
        style={{ padding: '7px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, outline: 'none' }} />
      <input type="date" value={filters.to} onChange={e => onChange({ ...filters, to: e.target.value })}
        style={{ padding: '7px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, outline: 'none' }} />
      <select value={filters.costCentre} onChange={e => onChange({ ...filters, costCentre: e.target.value })}
        style={{ padding: '7px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, backgroundColor: WHITE, outline: 'none' }}>
        <option value="">All Cost Centres</option>
        {costCentres.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
      </select>
      <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}
        style={{ padding: '7px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, backgroundColor: WHITE, outline: 'none' }}>
        <option value="">All Statuses</option>
        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <input value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })}
        placeholder="Search vendor, employee..."
        style={{ padding: '7px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, outline: 'none', minWidth: '180px' }} />
    </div>
  )
})

export default function ExpensesPage() {
  const [expenses, setExpenses]       = useState<any[]>([])
  const [costCentres, setCostCentres] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [filters, setFilters]         = useState({ from: '', to: '', costCentre: '', status: '', search: '' })
  const [exporting, setExporting]     = useState(false)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    fetchCostCentres()
    fetchExpenses()
  }, [])

  const fetchCostCentres = async () => {
    const { data } = await supabase.from('cost_centres').select('id, name').eq('is_active', true).order('name')
    setCostCentres(data ?? [])
  }

  const fetchExpenses = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('*, cost_centres(name), invoice_line_items(gl_codes(xero_account_code, name))')
      .eq('record_type', 'EXPENSE')
      .order('invoice_date', { ascending: false })
    setExpenses(data ?? [])
    setLoading(false)
  }

  const filtered = expenses.filter(e => {
    if (filters.from   && e.invoice_date < filters.from) return false
    if (filters.to     && e.invoice_date > filters.to)   return false
    if (filters.costCentre && e.cost_centre_id !== filters.costCentre) return false
    if (filters.status && e.status !== filters.status)   return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!e.supplier_name?.toLowerCase().includes(q) &&
          !e.submitted_by?.toLowerCase().includes(q) &&
          !e.client_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalValue = filtered.reduce((s, e) => s + (Number(e.amount_incl) || 0), 0)

  const handleExport = async () => {
    setExporting(true)
    try {
      const rows = [
        ['Date', 'Employee', 'Vendor', 'Client', 'Cost Centre', 'GL Code', 'Excl VAT', 'VAT', 'Total', 'Status', 'Notes'],
        ...filtered.map(e => {
          const gl = e.invoice_line_items?.[0]?.gl_codes
          return [
            fmtDate(e.invoice_date),
            e.submitted_by ?? '',
            e.supplier_name ?? '',
            e.client_name ?? '',
            e.cost_centres?.name ?? '',
            gl ? `${gl.xero_account_code} · ${gl.name}` : '',
            e.amount_excl ?? '',
            e.amount_vat ?? '',
            e.amount_incl ?? '',
            STATUS_META[e.status]?.label ?? e.status,
            e.notes ?? '',
          ]
        })
      ]

      // Build CSV
      const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `expenses-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err) }
    setExporting(false)
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '1100px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Expenses</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>
              {loading ? '...' : `${filtered.length} expense${filtered.length !== 1 ? 's' : ''} · Total: ${fmt(totalValue)}`}
            </p>
          </div>
          <button onClick={handleExport} disabled={exporting || filtered.length === 0}
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: exporting || filtered.length === 0 ? '#94A3B8' : OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {exporting ? 'Exporting...' : '↓ Export CSV'}
          </button>
        </div>

        {/* Filters */}
        <FilterBar filters={filters} costCentres={costCentres} onChange={setFilters} />

        {/* Summary cards */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Total Submitted',    value: fmt(expenses.reduce((s,e) => s+(Number(e.amount_incl)||0),0)), color: DARK },
              { label: 'Pending Review',     value: expenses.filter(e=>e.status==='PENDING_REVIEW').length,    color: AMBER },
              { label: 'Pending Approval',   value: expenses.filter(e=>e.status==='PENDING_APPROVAL').length, color: '#8B5CF6' },
              { label: 'Approved',           value: expenses.filter(e=>e.status==='APPROVED').length,         color: OLIVE },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          {isMobile ? (
            // Mobile list
            loading ? <div style={{ padding: '32px', textAlign: 'center', color: MUTED }}>Loading...</div> :
            filtered.length === 0 ? <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No expenses found</div> :
            filtered.map((e, i) => {
              const status = STATUS_META[e.status] ?? { label: e.status, color: MUTED, bg: LIGHT }
              return (
                <div key={e.id} style={{ padding: '14px 16px', borderBottom: i < filtered.length-1 ? `1px solid ${LIGHT}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{e.supplier_name ?? '—'}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>{fmt(e.amount_incl)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: MUTED }}>{fmtDate(e.invoice_date)} · {e.submitted_by?.split('@')[0]}</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: status.color, backgroundColor: status.bg, padding: '2px 8px', borderRadius: '10px' }}>{status.label}</span>
                  </div>
                  {e.cost_centres?.name && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{e.cost_centres.name}</div>}
                </div>
              )
            })
          ) : (
            // Desktop table
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 120px 140px 100px 90px 90px 110px', padding: '8px 14px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                {['Date', 'Employee', 'Vendor', 'Client', 'Cost Centre', 'GL Code', 'Excl', 'VAT', 'Total', 'Status'].slice(0,9).map(h => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>
              {loading ? <div style={{ padding: '32px', textAlign: 'center', color: MUTED }}>Loading...</div> :
               filtered.length === 0 ? <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No expenses found</div> :
               filtered.map((e, i) => {
                const status = STATUS_META[e.status] ?? { label: e.status, color: MUTED, bg: LIGHT }
                const gl = e.invoice_line_items?.[0]?.gl_codes
                return (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 120px 140px 100px 90px 90px 110px', padding: '10px 14px', borderBottom: i < filtered.length-1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: MUTED }}>{fmtDate(e.invoice_date)}</div>
                    <div style={{ fontSize: '12px', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.submitted_by?.split('@')[0] ?? '—'}</div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.supplier_name ?? '—'}</div>
                      {e.notes && <div style={{ fontSize: '10px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes}</div>}
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.client_name ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.cost_centres?.name ?? '—'}</div>
                    <div style={{ fontSize: '10px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gl ? `${gl.xero_account_code}` : '—'}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{e.amount_excl ? fmt(e.amount_excl) : '—'}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{e.amount_vat ? fmt(e.amount_vat) : '—'}</div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: DARK, marginBottom: '2px' }}>{fmt(e.amount_incl)}</div>
                      <span style={{ fontSize: '9px', fontWeight: '600', color: status.color, backgroundColor: status.bg, padding: '1px 6px', borderRadius: '8px' }}>{status.label}</span>
                    </div>
                  </div>
                )
               })}
              {filtered.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 120px 140px 100px 90px 90px 110px', padding: '8px 14px', backgroundColor: LIGHT, borderTop: `1px solid ${BORDER}` }}>
                  <div /><div /><div style={{ fontSize: '11px', fontWeight: '600', color: MUTED }}>{filtered.length} expenses</div>
                  <div /><div /><div />
                  <div style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{fmt(filtered.reduce((s,e)=>s+(Number(e.amount_excl)||0),0))}</div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{fmt(filtered.reduce((s,e)=>s+(Number(e.amount_vat)||0),0))}</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: DARK }}>{fmt(totalValue)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
