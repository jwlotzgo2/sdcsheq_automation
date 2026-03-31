'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import SupplierLayout from '@/components/SupplierShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const TEAL   = '#13B5EA'
const RED    = '#EF4444'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'
const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STEPS = ['Received', 'Under Review', 'Approved', 'Submitted to Finance', 'Paid']

const SUPPLIER_STATUS: Record<string, { label: string; color: string; bg: string; step: number }> = {
  INGESTED:         { label: 'Received',             color: '#64748B', bg: '#F1F5F9', step: 0 },
  EXTRACTING:       { label: 'Received',             color: '#64748B', bg: '#F1F5F9', step: 0 },
  PENDING_REVIEW:   { label: 'Under Review',         color: AMBER,     bg: '#FEF3C7', step: 1 },
  IN_REVIEW:        { label: 'Under Review',         color: AMBER,     bg: '#FEF3C7', step: 1 },
  RETURNED:         { label: 'Under Review',         color: AMBER,     bg: '#FEF3C7', step: 1 },
  PENDING_APPROVAL: { label: 'Under Review',         color: AMBER,     bg: '#FEF3C7', step: 1 },
  APPROVED:         { label: 'Approved',             color: OLIVE,     bg: '#F0FDF4', step: 2 },
  XERO_POSTED:      { label: 'Submitted to Finance', color: TEAL,      bg: '#EBF9FF', step: 3 },
  XERO_AUTHORISED:  { label: 'Submitted to Finance', color: TEAL,      bg: '#EBF9FF', step: 3 },
  XERO_PAID:        { label: 'Paid',                 color: OLIVE,     bg: '#F0FDF4', step: 4 },
  REJECTED:         { label: 'Not Accepted',         color: RED,       bg: '#FEE2E2', step: -1 },
}

function StatusTimeline({ status }: { status: string }) {
  const s = SUPPLIER_STATUS[status]
  if (!s || s.step < 0) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '6px 12px' }}>
      <span style={{ fontSize: '12px', fontWeight: '600', color: RED }}>✗ Not Accepted</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
      {STEPS.map((step, i) => {
        const done    = i <= s.step
        const current = i === s.step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: done ? AMBER : BORDER, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', fontWeight: current ? '700' : '400', color: current ? AMBER : done ? MUTED : BORDER, whiteSpace: 'nowrap' }}>{step}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: '24px', height: '2px', backgroundColor: i < s.step ? AMBER : BORDER, marginBottom: '14px', flexShrink: 0 }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function SupplierInvoices() {
  const [invoices, setInvoices]     = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('supplier_id, role')
        .eq('email', user.email)
        .maybeSingle()
      if (!['SUPPLIER','AP_ADMIN'].includes(profile?.role ?? '') || !profile.supplier_id) { router.push('/'); return }
      setSupplierId(profile.supplier_id)
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, amount_excl, amount_vat, amount_incl, status, created_at, notes')
        .eq('supplier_id', profile.supplier_id)
        .order('created_at', { ascending: false })
      setInvoices(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <SupplierLayout>
      <div style={{ maxWidth: '800px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>My Invoices</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>{loading ? '...' : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}</p>
          </div>
          <button onClick={() => router.push('/supplier/submit')}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            + Submit New
          </button>
        </div>

        {loading ? (
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>No invoices yet</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>Submit your first invoice to get started.</div>
            <button onClick={() => router.push('/supplier/submit')}
              style={{ padding: '11px 24px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Submit Invoice
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {invoices.map((inv, i) => {
              const s        = SUPPLIER_STATUS[inv.status] ?? SUPPLIER_STATUS['INGESTED']
              const isOpen   = expanded === inv.id
              return (
                <div key={inv.id} style={{ borderBottom: i < invoices.length - 1 ? `1px solid ${LIGHT}` : 'none' }}>
                  {/* Row */}
                  <div onClick={() => setExpanded(isOpen ? null : inv.id)}
                    style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.backgroundColor = LIGHT }}
                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.backgroundColor = WHITE }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '3px' }}>{inv.invoice_number ?? `Submitted ${fmtDate(inv.created_at)}`}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{fmtDate(inv.invoice_date)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: '600', color: s.color, backgroundColor: s.bg, padding: '3px 10px', borderRadius: '10px' }}>{s.label}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{fmt(inv.amount_incl)}</span>
                      <span style={{ color: MUTED, fontSize: '16px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${LIGHT}` }}>
                      {/* Timeline */}
                      <div style={{ padding: '16px 0', overflowX: 'auto' }}>
                        <StatusTimeline status={inv.status} />
                      </div>

                      {/* Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                        {[
                          { label: 'Invoice Date', value: fmtDate(inv.invoice_date) },
                          { label: 'Due Date',     value: fmtDate(inv.due_date) },
                          { label: 'Excl. VAT',    value: fmt(inv.amount_excl) },
                          { label: 'VAT',          value: fmt(inv.amount_vat) },
                          { label: 'Total',        value: fmt(inv.amount_incl) },
                          { label: 'Submitted',    value: fmtDate(inv.created_at) },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ backgroundColor: LIGHT, borderRadius: '7px', padding: '9px 12px' }}>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{label}</div>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: DARK }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {inv.status === 'REJECTED' && inv.notes && (
                        <div style={{ marginTop: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: RED, marginBottom: '3px' }}>Reason</div>
                          <div style={{ fontSize: '13px', color: DARK }}>{inv.notes}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SupplierLayout>
  )
}
