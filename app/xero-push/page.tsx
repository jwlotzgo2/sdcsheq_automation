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
const RED    = '#EF4444'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'
const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type PushStatus = 'idle' | 'pending' | 'success' | 'error' | 'skipped'

export default function XeroPushPage() {
  const [invoices, setInvoices]     = useState<any[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [pushing, setPushing]       = useState(false)
  const [done, setDone]             = useState(false)
  const [results, setResults]       = useState<Record<string, { status: PushStatus; error?: string }>>({})

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchInvoices() }, [])

  const fetchInvoices = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, supplier_name, invoice_date, due_date, amount_incl, amount_excl, amount_vat, status')
      .eq('status', 'APPROVED')
      .order('invoice_date', { ascending: true })
    setInvoices(data ?? [])
    // Select all by default
    setSelected(new Set((data ?? []).map((i: any) => i.id)))
    setLoading(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set())
    else setSelected(new Set(invoices.map(i => i.id)))
  }

  const handlePush = async () => {
    const toBePushed = invoices.filter(i => selected.has(i.id))
    if (toBePushed.length === 0) return
    setPushing(true)

    // Init all as pending
    const init: Record<string, { status: PushStatus }> = {}
    toBePushed.forEach(i => { init[i.id] = { status: 'pending' } })
    invoices.filter(i => !selected.has(i.id)).forEach(i => { init[i.id] = { status: 'skipped' } })
    setResults(init)

    for (const inv of toBePushed) {
      try {
        const res  = await fetch('/api/xero/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id }) })
        const data = await res.json()
        setResults(prev => ({ ...prev, [inv.id]: { status: data.success ? 'success' : 'error', error: data.error } }))
      } catch (err: any) {
        setResults(prev => ({ ...prev, [inv.id]: { status: 'error', error: err.message } }))
      }
    }

    setPushing(false)
    setDone(true)
    fetchInvoices()
  }

  const selectedInvoices = invoices.filter(i => selected.has(i.id))
  const totalValue = selectedInvoices.reduce((sum, i) => sum + (Number(i.amount_incl) || 0), 0)
  const successCount = Object.values(results).filter(r => r.status === 'success').length
  const errorCount   = Object.values(results).filter(r => r.status === 'error').length

  const StatusIcon = ({ id }: { id: string }) => {
    const r = results[id]
    if (!r) return null
    if (r.status === 'pending') return <span style={{ color: AMBER, fontSize: '16px' }}>⟳</span>
    if (r.status === 'success') return <span style={{ color: OLIVE, fontSize: '16px' }}>✓</span>
    if (r.status === 'error')   return <span style={{ color: RED, fontSize: '16px' }} title={r.error}>✗</span>
    if (r.status === 'skipped') return <span style={{ color: MUTED, fontSize: '13px' }}>—</span>
    return null
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '900px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Push to Xero</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>
              {loading ? '...' : `${invoices.length} approved invoice${invoices.length !== 1 ? 's' : ''} ready to push`}
            </p>
          </div>
          {!done && invoices.length > 0 && (
            <button onClick={handlePush} disabled={pushing || selected.size === 0}
              style={{ padding: '11px 24px', borderRadius: '9px', border: 'none', backgroundColor: pushing || selected.size === 0 ? '#94A3B8' : '#13B5EA', color: WHITE, fontSize: '14px', fontWeight: '700', cursor: pushing || selected.size === 0 ? 'not-allowed' : 'pointer' }}>
              {pushing ? 'Pushing...' : `Submit ${selected.size} Invoice${selected.size !== 1 ? 's' : ''} to Xero`}
            </button>
          )}
          {done && (
            <button onClick={() => { setDone(false); setResults({}); fetchInvoices() }}
              style={{ padding: '11px 24px', borderRadius: '9px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Done ✓
            </button>
          )}
        </div>

        {/* Summary bar */}
        {selected.size > 0 && (
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selected</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: DARK }}>{selected.size}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Value</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: DARK }}>{fmt(totalValue)}</div>
              </div>
              {done && (
                <>
                  <div>
                    <span style={{ fontSize: '11px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Succeeded</span>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: OLIVE }}>{successCount}</div>
                  </div>
                  {errorCount > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Failed</span>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: RED }}>{errorCount}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Invoice table */}
        {loading ? (
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Nothing to push</div>
            <div style={{ fontSize: '13px', color: MUTED }}>All approved invoices have been posted to Xero.</div>
          </div>
        ) : (
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 110px 110px 110px 36px', padding: '10px 16px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
              <input type="checkbox" checked={selected.size === invoices.length} onChange={toggleAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: AMBER }} />
              {['Supplier / Invoice', 'Invoice Date', 'Excl. VAT', 'VAT', 'Total', ''].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {invoices.map((inv, i) => {
              const isSelected = selected.has(inv.id)
              const result = results[inv.id]
              return (
                <div key={inv.id}
                  style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 110px 110px 110px 36px', padding: '12px 16px', borderBottom: i < invoices.length - 1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center', backgroundColor: result?.status === 'error' ? '#FFF5F5' : result?.status === 'success' ? '#F0FDF4' : isSelected ? WHITE : '#FAFAF8', opacity: !isSelected && !result ? 0.5 : 1 }}>
                  <input type="checkbox" checked={isSelected} onChange={() => !pushing && toggleSelect(inv.id)}
                    disabled={pushing} style={{ width: '16px', height: '16px', cursor: pushing ? 'not-allowed' : 'pointer', accentColor: AMBER }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{inv.supplier_name ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{inv.invoice_number ?? '—'}</div>
                    {result?.status === 'error' && <div style={{ fontSize: '11px', color: RED, marginTop: '2px' }}>{result.error}</div>}
                  </div>
                  <div style={{ fontSize: '12px', color: MUTED }}>{fmtDate(inv.invoice_date)}</div>
                  <div style={{ fontSize: '12px', color: DARK }}>{fmt(inv.amount_excl)}</div>
                  <div style={{ fontSize: '12px', color: MUTED }}>{fmt(inv.amount_vat)}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{fmt(inv.amount_incl)}</div>
                  <div style={{ textAlign: 'center' }}><StatusIcon id={inv.id} /></div>
                </div>
              )
            })}

            {/* Totals row */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 110px 110px 110px 36px', padding: '10px 16px', backgroundColor: LIGHT, borderTop: `1px solid ${BORDER}`, alignItems: 'center' }}>
              <div /><div style={{ fontSize: '12px', fontWeight: '600', color: MUTED }}>{selectedInvoices.length} of {invoices.length} selected</div>
              <div />
              <div style={{ fontSize: '12px', fontWeight: '600', color: DARK }}>{fmt(selectedInvoices.reduce((s, i) => s + (Number(i.amount_excl) || 0), 0))}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: DARK }}>{fmt(selectedInvoices.reduce((s, i) => s + (Number(i.amount_vat) || 0), 0))}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>{fmt(totalValue)}</div>
              <div />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
