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

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const SUPPLIER_STATUS: Record<string, { label: string; color: string; bg: string; step: number }> = {
  INGESTED:          { label: 'Received',           color: '#64748B', bg: '#F1F5F9', step: 1 },
  EXTRACTING:        { label: 'Received',           color: '#64748B', bg: '#F1F5F9', step: 1 },
  PENDING_REVIEW:    { label: 'Under Review',       color: AMBER,     bg: '#FEF3C7', step: 2 },
  IN_REVIEW:         { label: 'Under Review',       color: AMBER,     bg: '#FEF3C7', step: 2 },
  RETURNED:          { label: 'Under Review',       color: AMBER,     bg: '#FEF3C7', step: 2 },
  PENDING_APPROVAL:  { label: 'Under Review',       color: AMBER,     bg: '#FEF3C7', step: 2 },
  APPROVED:          { label: 'Approved',           color: OLIVE,     bg: '#F0FDF4', step: 3 },
  XERO_POSTED:       { label: 'Submitted to Finance', color: TEAL,   bg: '#EBF9FF', step: 4 },
  XERO_AUTHORISED:   { label: 'Submitted to Finance', color: TEAL,   bg: '#EBF9FF', step: 4 },
  XERO_PAID:         { label: 'Paid',               color: OLIVE,     bg: '#F0FDF4', step: 5 },
  REJECTED:          { label: 'Not Accepted',       color: '#EF4444', bg: '#FEE2E2', step: 0 },
}

export default function SupplierDashboard() {
  const [invoices, setInvoices]   = useState<any[]>([])
  const [supplier, setSupplier]   = useState<any>(null)
  const [loading, setLoading]     = useState(true)
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

      const [{ data: sup }, { data: invs }] = await Promise.all([
        supabase.from('suppliers').select('*').eq('id', profile.supplier_id).single(),
        supabase.from('invoices').select('id, invoice_number, invoice_date, amount_incl, status, created_at')
          .eq('supplier_id', profile.supplier_id)
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      setSupplier(sup)
      setInvoices(invs ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const totalPaid    = invoices.filter(i => i.status === 'XERO_PAID').reduce((s, i) => s + (Number(i.amount_incl) || 0), 0)
  const totalPending = invoices.filter(i => !['XERO_PAID','REJECTED'].includes(i.status)).reduce((s, i) => s + (Number(i.amount_incl) || 0), 0)

  return (
    <SupplierLayout>
      <div style={{ maxWidth: '800px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>
            Welcome{supplier?.name ? `, ${supplier.name}` : ''} 👋
          </h1>
          <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>Here's a summary of your invoices with SDC SHEQ</p>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Invoices',    value: invoices.length,  color: DARK,  bg: WHITE },
            { label: 'Pending Payment',   value: fmt(totalPending), color: AMBER, bg: '#FEF3C7' },
            { label: 'Total Paid',        value: fmt(totalPaid),   color: OLIVE, bg: '#F0FDF4' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ backgroundColor: bg, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color }}>{loading ? '—' : value}</div>
            </div>
          ))}
        </div>

        {/* Recent invoices */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: 0 }}>Recent Invoices</h2>
            <button onClick={() => router.push('/supplier/invoices')} style={{ background: 'none', border: 'none', color: AMBER, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>View all →</button>
          </div>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : invoices.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
              No invoices yet. Submit your first invoice to get started.
            </div>
          ) : invoices.map((inv, i) => {
            const s = SUPPLIER_STATUS[inv.status] ?? SUPPLIER_STATUS['INGESTED']
            return (
              <div key={inv.id} style={{ padding: '12px 16px', borderBottom: i < invoices.length - 1 ? `1px solid ${LIGHT}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{inv.invoice_number ?? `Invoice ${i + 1}`}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{fmtDate(inv.invoice_date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: s.color, backgroundColor: s.bg, padding: '3px 10px', borderRadius: '10px' }}>{s.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>{fmt(inv.amount_incl)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick actions */}
        <button onClick={() => router.push('/supplier/submit')}
          style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
          + Submit New Invoice
        </button>
      </div>
    </SupplierLayout>
  )
}
