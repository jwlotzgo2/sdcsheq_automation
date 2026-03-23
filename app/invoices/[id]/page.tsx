'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  INGESTED:          { color: '#64748B', bg: '#F1F5F9', label: 'Ingested' },
  EXTRACTING:        { color: '#8B5CF6', bg: '#F5F3FF', label: 'Extracting' },
  EXTRACTION_FAILED: { color: '#EF4444', bg: '#FEE2E2', label: 'Extraction Failed' },
  PENDING_REVIEW:    { color: '#E8960C', bg: '#FEF3C7', label: 'Pending Review' },
  IN_REVIEW:         { color: '#3B82F6', bg: '#EBF4FF', label: 'In Review' },
  PENDING_APPROVAL:  { color: '#8B5CF6', bg: '#F5F3FF', label: 'Pending Approval' },
  APPROVED:          { color: '#10B981', bg: '#DCFCE7', label: 'Approved' },
  REJECTED:          { color: '#EF4444', bg: '#FEE2E2', label: 'Rejected' },
  XERO_POSTED:       { color: '#0D7A6E', bg: '#E6F6F4', label: 'Xero Posted' },
  XERO_PAID:         { color: '#166534', bg: '#DCFCE7', label: 'Paid' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [invoice, setInvoice]       = useState<any>(null)
  const [lines, setLines]           = useState<any[]>([])
  const [glCodes, setGlCodes]       = useState<any[]>([])
  const [suppliers, setSuppliers]   = useState<any[]>([])
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes]           = useState('')
  const [activeTab, setActiveTab]   = useState<'details' | 'audit'>('details')
  const [auditTrail, setAuditTrail] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: inv }, { data: lineData }, { data: glData }, { data: audit }, { data: suppData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*, gl_codes(id, xero_account_code, name)').eq('invoice_id', id).order('sort_order'),
      supabase.from('gl_codes').select('id, xero_account_code, name').eq('is_active', true).order('xero_account_code'),
      supabase.from('audit_trail').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('suppliers').select('id, name, vat_number').eq('is_active', true).order('name'),
    ])
    setInvoice(inv)
    setLines(lineData ?? [])
    setGlCodes(glData ?? [])
    setAuditTrail(audit ?? [])
    setSuppliers(suppData ?? [])
    setSelectedSupplier(inv?.supplier_id ?? '')

    if (inv?.storage_path) {
      const path = inv.storage_path.replace('invoices/', '')
      const { data: urlData } = await supabase.storage.from('invoices').createSignedUrl(path, 3600)
      if (urlData) setPdfUrl(urlData.signedUrl)
    }
    setLoading(false)
  }

  const updateLine = (index: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  const handleSubmitForApproval = async () => {
    setSubmitting(true)
    await supabase.from('invoices').update({
      status: 'PENDING_APPROVAL',
      supplier_id: selectedSupplier || null,
      notes: notes || invoice?.notes,
    }).eq('id', id)
    for (const line of lines) {
      await supabase.from('invoice_line_items').update({
        gl_code_id: line.gl_code_id ?? line.gl_codes?.id,
        description: line.description,
      }).eq('id', line.id)
    }
    await supabase.from('audit_trail').insert({
      invoice_id: id,
      from_status: invoice?.status,
      to_status: 'PENDING_APPROVAL',
      actor_email: (await supabase.auth.getUser()).data.user?.email,
      notes: notes || 'Submitted for approval',
    })
    router.push('/invoices')
  }

  const handleReject = async () => {
    if (!notes) { alert('Please add a rejection reason in the notes field.'); return }
    setSubmitting(true)
    await supabase.from('invoices').update({ status: 'REJECTED', rejection_reason: notes }).eq('id', id)
    await supabase.from('audit_trail').insert({
      invoice_id: id,
      from_status: invoice?.status,
      to_status: 'REJECTED',
      actor_email: (await supabase.auth.getUser()).data.user?.email,
      notes,
    })
    router.push('/invoices')
  }

  if (loading) return <AppShell><div style={{ padding: '60px', textAlign: 'center', color: MUTED, fontSize: '14px' }}>Loading...</div></AppShell>
  if (!invoice) return <AppShell><div style={{ padding: '60px', textAlign: 'center', color: MUTED, fontSize: '14px' }}>Invoice not found.</div></AppShell>

  const statusStyle = STATUS_STYLES[invoice.status] ?? STATUS_STYLES['INGESTED']
  const canReview = ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED'].includes(invoice.status)

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
          <div>
            <button onClick={() => router.push('/invoices')} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '13px', cursor: 'pointer', padding: '0 0 6px', display: 'block' }}>
              ← Back to invoices
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: 0 }}>{invoice.supplier_name ?? 'Unknown Supplier'}</h1>
              <span style={{ fontSize: '13px', color: MUTED }}>{invoice.invoice_number ?? '—'}</span>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontSize: '11px', fontWeight: '600' }}>
                {statusStyle.label}
              </span>
            </div>
          </div>
          {canReview && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleReject} disabled={submitting} style={{ padding: '9px 20px', borderRadius: '7px', border: '1.5px solid #EF4444', backgroundColor: '#fff', color: '#EF4444', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Reject
              </button>
              <button onClick={handleSubmitForApproval} disabled={submitting} style={{ padding: '9px 20px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          )}
        </div>

        {/* Two column — left data, right PDF */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 520px', gap: '16px', flex: 1, minHeight: 0 }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '4px' }}>

            {/* Summary card */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                {[
                  { label: 'Invoice Date', value: fmtDate(invoice.invoice_date) },
                  { label: 'Due Date',     value: fmtDate(invoice.due_date) },
                  { label: 'Excl. VAT',   value: fmt(invoice.amount_excl) },
                  { label: 'VAT',         value: fmt(invoice.amount_vat) },
                  { label: 'Total',       value: fmt(invoice.amount_incl) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: DARK }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Supplier dropdown */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${LIGHT}` }}>
                <label style={{ display: 'block', fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
                  Supplier
                </label>
                {canReview ? (
                  <select
                    value={selectedSupplier}
                    onChange={e => setSelectedSupplier(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', backgroundColor: '#fff', color: DARK }}
                  >
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` · ${s.vat_number}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: '13px', color: DARK }}>{invoice.supplier_name ?? '—'}</span>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              {(['details', 'audit'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '8px 18px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab ? `2px solid ${AMBER}` : '2px solid transparent',
                  color: activeTab === tab ? AMBER : MUTED,
                  fontSize: '13px', fontWeight: activeTab === tab ? '600' : '400',
                  cursor: 'pointer', marginBottom: '-1px',
                }}>
                  {tab === 'details' ? 'Line Items' : 'Audit Trail'}
                </button>
              ))}
            </div>

            {activeTab === 'details' && (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 200px', padding: '10px 16px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                  {['Description', 'Qty', 'Unit Price', 'Total', 'GL Code'].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>{h}</div>
                  ))}
                </div>
                {lines.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No line items extracted.</div>
                ) : (
                  lines.map((line, i) => (
                    <div key={line.id} style={{
                      display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px 200px',
                      padding: '11px 16px', borderBottom: i < lines.length - 1 ? `1px solid ${LIGHT}` : 'none',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontSize: '13px', color: DARK, paddingRight: '12px', textAlign: 'left' }}>{line.description}</div>
                      <div style={{ fontSize: '13px', color: DARK }}>{line.quantity}</div>
                      <div style={{ fontSize: '13px', color: DARK }}>{fmt(line.unit_price)}</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: DARK }}>{fmt(line.line_total)}</div>
                      <div>
                        {canReview ? (
                          <select
                            value={line.gl_code_id ?? line.gl_codes?.id ?? ''}
                            onChange={e => updateLine(i, 'gl_code_id', e.target.value)}
                            style={{ width: '100%', padding: '5px 7px', fontSize: '12px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#fff', color: DARK }}
                          >
                            <option value="">— GL code —</option>
                            {glCodes.map(g => (
                              <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: '12px', color: MUTED }}>
                            {line.gl_codes ? `${line.gl_codes.xero_account_code} · ${line.gl_codes.name}` : '—'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {/* Totals */}
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: '24px', backgroundColor: LIGHT }}>
                  <span style={{ fontSize: '12px', color: MUTED }}>Excl. VAT: {fmt(invoice.amount_excl)}</span>
                  <span style={{ fontSize: '12px', color: MUTED }}>VAT: {fmt(invoice.amount_vat)}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>Total: {fmt(invoice.amount_incl)}</span>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                {auditTrail.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No audit entries yet.</div>
                ) : (
                  auditTrail.map((entry, i) => (
                    <div key={entry.id} style={{ padding: '12px 16px', borderBottom: i < auditTrail.length - 1 ? `1px solid ${LIGHT}` : 'none', display: 'flex', gap: '12px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: AMBER, flexShrink: 0, marginTop: '5px' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '2px' }}>
                          {entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{entry.actor_email} · {fmtDate(entry.created_at)}</div>
                        {entry.notes && <div style={{ fontSize: '12px', color: DARK, marginTop: '3px' }}>{entry.notes}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Notes */}
            {canReview && (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '14px 16px', flexShrink: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '7px' }}>
                  Notes / Rejection reason
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add a note for the approver, or a reason for rejection..."
                  rows={3}
                  style={{ width: '100%', padding: '9px 11px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', resize: 'vertical', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }}
                />
              </div>
            )}
          </div>

          {/* RIGHT — PDF */}
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              Invoice PDF
            </div>
            {pdfUrl ? (
              <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} title="Invoice PDF" />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '32px' }}>📄</div>
                <div>PDF not available</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
