'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import SearchableSelect from '@/components/SearchableSelect'
import XeroMatchBanner from '@/components/XeroMatchBanner'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

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
  <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#EDE9E3', flexShrink: 0 }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ height: '12px', width: '60%', borderRadius: '4px', backgroundColor: '#EDE9E3' }} />
      <div style={{ height: '10px', width: '40%', borderRadius: '4px', backgroundColor: '#F3F0EB' }} />
    </div>
    <div style={{ width: '60px', height: '20px', borderRadius: '10px', backgroundColor: '#EDE9E3' }} />
  </div>
)

export default function ReviewPage() {
  const [invoices, setInvoices]             = useState<any[]>([])
  const [selected, setSelected]             = useState<any>(null)
  const [lines, setLines]                   = useState<any[]>([])
  const [glCodes, setGlCodes]               = useState<any[]>([])
  const [suppliers, setSuppliers]           = useState<any[]>([])
  const [pdfUrl, setPdfUrl]                 = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [notes, setNotes]                   = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [loadingDetail, setLoadingDetail]   = useState(false)
  const [auditTrail, setAuditTrail]           = useState<any[]>([])
  const [mobileView, setMobileView]         = useState<'list' | 'detail' | 'pdf'>('list')
  const [showPdf, setShowPdf]               = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName]       = useState('')
  const [newSupplierEmail, setNewSupplierEmail]     = useState('')
  const [newSupplierVat, setNewSupplierVat]         = useState('')
  const [creatingSupplier, setCreatingSupplier]     = useState(false)
  const [createError, setCreateError]               = useState('')
  const [completedInvoices, setCompletedInvoices]   = useState<any[]>([])
  const [showCompleted, setShowCompleted]           = useState(false)
  const [headerGl, setHeaderGl]                     = useState('')
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchInvoices(); fetchCompletedInvoices() }, [])
  useEffect(() => { if (glCodes.length === 0) fetchGlAndSuppliers() }, [])

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, status, supplier_name, invoice_number, invoice_date, amount_incl, created_at')
      .in('status', ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED'])
      .order('created_at', { ascending: false })
    setInvoices(data ?? [])
    if (data && data.length > 0 && !selected) {
      if (!isMobile) selectInvoice(data[0].id)
    }
  }

  const fetchGlAndSuppliers = async () => {
    const [{ data: gl }, { data: supp }] = await Promise.all([
      supabase.from('gl_codes').select('id, xero_account_code, name, account_type').eq('is_active', true).not('account_type', 'in', '("REVENUE")').order('xero_account_code'),
      supabase.from('suppliers').select('id, name, vat_number').eq('is_active', true).order('name'),
    ])
    setGlCodes(gl ?? [])
    setSuppliers(supp ?? [])
  }

  const selectInvoice = async (id: string) => {
    setLoadingDetail(true)
    setPdfUrl(null)
    setNotes('')
    if (isMobile) setMobileView('detail')

    const [{ data: inv }, { data: lineData }, { data: audit }] = await Promise.all([
      supabase.from('invoices').select('id, status, supplier_id, supplier_name, invoice_number, invoice_date, due_date, amount_excl, amount_vat, amount_incl, currency, notes, storage_path, rejection_reason, record_type, submitted_by').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*, gl_codes(id, xero_account_code, name)').eq('invoice_id', id).order('sort_order'),
      supabase.from('audit_trail').select('id, from_status, to_status, actor_email, notes, created_at').eq('invoice_id', id).order('created_at'),
    ])

    setSelected(inv)
    setLines(lineData ?? [])
    setAuditTrail(audit ?? [])
    setSelectedSupplier(inv?.supplier_id ?? '')

    if (inv?.storage_path) {
      const path = inv.storage_path.replace('invoices/', '')
      const { data: urlData } = await supabase.storage.from('invoices').createSignedUrl(path, 3600)
      if (urlData) setPdfUrl(urlData.signedUrl)
    }
    setLoadingDetail(false)
  }

  const fetchCompletedInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, status, supplier_name, invoice_number, invoice_date, amount_incl, updated_at')
      .in('status', ['PENDING_APPROVAL', 'APPROVED', 'XERO_POSTED', 'XERO_AUTHORISED', 'XERO_PAID'])
      .order('updated_at', { ascending: false })
      .limit(50)
    setCompletedInvoices(data ?? [])
  }

  const updateLine = (index: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  const applyHeaderGl = (glId: string) => {
    setHeaderGl(glId)
    if (glId) setLines(prev => prev.map(l => ({ ...l, gl_code_id: glId })))
  }

  const updateHeaderField = async (field: string, value: any) => {
    if (!selected) return
    setSelected((prev: any) => ({ ...prev, [field]: value }))
    await supabase.from('invoices').update({ [field]: value || null }).eq('id', selected.id)
  }

  const handleCreateSupplier = async () => {
    if (!newSupplierName) return
    setCreatingSupplier(true); setCreateError('')
    const res = await fetch('/api/xero/create-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSupplierName, email: newSupplierEmail, vat_number: newSupplierVat }),
    })
    const data = await res.json()
    if (data.error) { setCreateError(data.error); setCreatingSupplier(false); return }
    // Add to suppliers list and auto-select
    setSuppliers(prev => [...prev, data.supplier])
    setSelectedSupplier(data.supplier.id)
    setShowCreateSupplier(false)
    setNewSupplierName(''); setNewSupplierEmail(''); setNewSupplierVat('')
    setCreatingSupplier(false)
  }

  const handleSubmit = async () => {
    if (!selected) return
    setSubmitting(true)
    const user = (await supabase.auth.getUser()).data.user

    // Log supplier correction if changed
    if (selectedSupplier && selectedSupplier !== selected.supplier_id) {
      await supabase.from('supplier_corrections').insert({
        invoice_id:    selected.id,
        extracted_name: selected.supplier_name,
        corrected_to:  selectedSupplier,
        corrected_by:  user?.email,
      })
    }

    await supabase.from('invoices').update({
      status: 'PENDING_APPROVAL',
      supplier_id: selectedSupplier || null,
      notes: notes || selected.notes,
    }).eq('id', selected.id)

    // Save line items and log GL corrections
    for (const line of lines) {
      const newGlId = line.gl_code_id ?? line.gl_codes?.id
      const origGlId = line.gl_codes?.id
      if (newGlId && newGlId !== origGlId) {
        await supabase.from('gl_corrections').insert({
          invoice_id:       selected.id,
          supplier_id:      selectedSupplier || selected.supplier_id || null,
          line_description: line.description,
          extracted_gl_id:  origGlId || null,
          corrected_gl_id:  newGlId,
          corrected_by:     user?.email,
        })
      }
      await supabase.from('invoice_line_items').update({ gl_code_id: newGlId }).eq('id', line.id)
    }

    await supabase.from('audit_trail').insert({
      invoice_id: selected.id, from_status: selected.status, to_status: 'PENDING_APPROVAL',
      actor_email: user?.email,
      notes: notes || 'Submitted for approval',
    })
    const remaining = invoices.filter(i => i.id !== selected.id)
    setInvoices(remaining)
    setSubmitting(false)
    if (isMobile) setMobileView('list')
    if (remaining.length > 0) { if (!isMobile) selectInvoice(remaining[0].id) }
    else { setSelected(null); setLines([]) }
  }

  const handleReject = async () => {
    if (!selected) return
    if (!notes) { alert('Please add a rejection reason.'); return }
    setSubmitting(true)
    await supabase.from('invoices').update({ status: 'REJECTED', rejection_reason: notes }).eq('id', selected.id)
    await supabase.from('audit_trail').insert({
      invoice_id: selected.id, from_status: selected.status, to_status: 'REJECTED',
      actor_email: (await supabase.auth.getUser()).data.user?.email, notes,
    })
    const remaining = invoices.filter(i => i.id !== selected.id)
    setInvoices(remaining)
    setSubmitting(false)
    if (isMobile) setMobileView('list')
    if (remaining.length > 0) { if (!isMobile) selectInvoice(remaining[0].id) }
    else { setSelected(null); setLines([]) }
  }

  const handleRecall = async () => {
    if (!selected || !['PENDING_APPROVAL', 'APPROVED'].includes(selected.status)) return
    setSubmitting(true)
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('invoices').update({ status: 'IN_REVIEW' }).eq('id', selected.id)
    await supabase.from('audit_trail').insert({
      invoice_id: selected.id, from_status: selected.status, to_status: 'IN_REVIEW',
      actor_email: user?.email, notes: `Recalled by reviewer from ${selected.status}`,
    })
    setSubmitting(false)
    // Move invoice from completed back to queue
    setCompletedInvoices(prev => prev.filter(i => i.id !== selected.id))
    const recalled = { ...selected, status: 'IN_REVIEW' }
    setInvoices(prev => [recalled, ...prev])
    setSelected(recalled)
  }

  const [reextracting, setReextracting] = useState(false)

  const handleReextract = async () => {
    if (!selected) return
    setReextracting(true)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: selected.id, reextract: true }),
      })
      const data = await res.json()
      if (data.error) alert(`Re-extraction failed: ${data.error}`)
      else {
        // Reload the invoice
        await selectInvoice(selected.id)
        await fetchInvoices()
      }
    } catch (err: any) { alert(`Re-extraction failed: ${err.message}`) }
    setReextracting(false)
  }

  const isRecallable = ['PENDING_APPROVAL', 'APPROVED'].includes(selected?.status)

  // ── MOBILE ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <AppShell>
        {/* PDF full-screen modal */}
        {showPdf && pdfUrl && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: DARK, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: DARK, flexShrink: 0 }}>
              <span style={{ color: WHITE, fontWeight: '600', fontSize: '14px' }}>Invoice PDF</span>
              <button onClick={() => setShowPdf(false)} style={{ background: 'none', border: 'none', color: WHITE, fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF" />
          </div>
        )}

        {/* LIST VIEW */}
        {mobileView === 'list' && (
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Review Queue</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 16px' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} awaiting review</p>
            {invoices.length === 0 ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                No invoices to review
              </div>
            ) : (
              <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                {invoices.map((inv, i) => (
                  <div
                    key={inv.id}
                    onClick={() => selectInvoice(inv.id)}
                    style={{ padding: '16px', borderBottom: i < invoices.length - 1 ? `1px solid ${LIGHT}` : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.supplier_name ?? 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: MUTED }}>{inv.invoice_number ?? '—'} · {fmtDate(inv.invoice_date)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{fmt(inv.amount_incl)}</span>
                      <span style={{ color: MUTED, fontSize: '18px' }}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DETAIL VIEW */}
        {mobileView === 'detail' && selected && (
          <div style={{ paddingBottom: '80px' }}>
            {/* Back button */}
            <button onClick={() => setMobileView('list')} style={{ background: 'none', border: 'none', color: AMBER, fontSize: '14px', fontWeight: '600', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ All Invoices
            </button>

            {loadingDetail ? (
              <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}>Loading...</div>
            ) : (
              <>
                {/* Summary card */}
                <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '16px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: DARK, marginBottom: '4px' }}>{selected.supplier_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: '12px', color: MUTED, marginBottom: '12px' }}>{selected.invoice_number}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'Date',      value: fmtDate(selected.invoice_date) },
                      { label: 'Due',       value: fmtDate(selected.due_date) },
                      { label: 'Excl. VAT', value: fmt(selected.amount_excl) },
                      { label: 'Total',     value: fmt(selected.amount_incl) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: DARK }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Supplier</div>
                  <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} style={{ width: '100%', padding: '10px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', backgroundColor: WHITE, color: DARK }}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` · ${s.vat_number}` : ''}</option>)}
                  </select>
                  {!selectedSupplier && (
                    <button onClick={() => { setNewSupplierName(selected?.supplier_name ?? ''); setShowCreateSupplier(true) }}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1.5px solid #13B5EA`, backgroundColor: WHITE, color: '#13B5EA', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' }}>
                      + Create supplier in Xero
                    </button>
                  )}
                </div>

                {/* Xero Match Banner (mobile) */}
                <div style={{ marginBottom: '12px' }}>
                  <XeroMatchBanner invoiceId={selected.id} />
                </div>

                {/* View PDF button */}
                {pdfUrl && (
                  <button onClick={() => setShowPdf(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    📄 View Invoice PDF
                  </button>
                )}

                {/* Header GL — apply to all lines (mobile) */}
                <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '12px 16px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Apply GL to all lines</div>
                  <select value={headerGl} onChange={e => applyHeaderGl(e.target.value)} style={{ width: '100%', padding: '10px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', backgroundColor: WHITE, color: DARK }}>
                    <option value="">— Select to apply —</option>
                    {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
                  </select>
                </div>

                {/* Line items */}
                <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</div>
                  {lines.map((line, i) => (
                    <div key={line.id} style={{ padding: '12px 16px', borderBottom: i < lines.length - 1 ? `1px solid ${LIGHT}` : 'none' }}>
                      <div style={{ fontSize: '13px', color: DARK, marginBottom: '6px' }}>{line.description}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: MUTED }}>Qty {line.quantity} × {fmt(line.unit_price)}</span>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{fmt(line.line_total)}</span>
                      </div>
                      <select
                        value={line.gl_code_id ?? line.gl_codes?.id ?? ''}
                        onChange={e => updateLine(i, 'gl_code_id', e.target.value)}
                        style={{ width: '100%', padding: '8px', fontSize: '13px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: WHITE, color: DARK }}
                      >
                        <option value="">— GL code —</option>
                        {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
                      </select>
                    </div>
                  ))}
                  <div style={{ padding: '10px 16px', backgroundColor: LIGHT, display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
                    <span style={{ fontSize: '12px', color: MUTED }}>VAT: {fmt(selected.amount_vat)}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>Total: {fmt(selected.amount_incl)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '14px 16px', marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Notes / Rejection Reason</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for approver or rejection reason..." rows={3}
                    style={{ width: '100%', padding: '10px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }} />
                </div>
              </>
            )}

            {/* Sticky action buttons */}
            <div style={{ position: 'fixed', bottom: '60px', left: 0, right: 0, padding: '12px 16px', backgroundColor: WHITE, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '10px', zIndex: 50 }}>
              <button onClick={handleReject} disabled={submitting} style={{ flex: 1, padding: '14px', borderRadius: '10px', border: '2px solid #EF4444', backgroundColor: WHITE, color: '#EF4444', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                Reject
              </button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                {submitting ? 'Submitting...' : 'Submit for Approval →'}
              </button>
            </div>
          </div>
        )}
      </AppShell>
    )
  }

  // ── DESKTOP ─────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* PDF fullscreen modal */}
      {showPdf && pdfUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: DARK, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', backgroundColor: DARK, flexShrink: 0 }}>
            <span style={{ color: WHITE, fontWeight: '600', fontSize: '14px' }}>{selected?.supplier_name} — {selected?.invoice_number}</span>
            <button onClick={() => setShowPdf(false)} style={{ background: 'none', border: 'none', color: WHITE, fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>
          <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF" />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: '0 0 2px' }}>Review Queue</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} awaiting review</p>
          </div>
          {selected && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {isRecallable ? (
                <button onClick={handleRecall} disabled={submitting} style={{ padding: '7px 16px', borderRadius: '7px', border: '1.5px solid #F97316', backgroundColor: WHITE, color: '#F97316', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  {submitting ? 'Recalling...' : 'Recall for Editing'}
                </button>
              ) : (
                <>
                  <button onClick={handleReextract} disabled={reextracting} style={{ padding: '7px 12px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    {reextracting ? 'Extracting...' : '🔄 Re-scan'}
                  </button>
                  <button onClick={handleReject} disabled={submitting} style={{ padding: '7px 14px', borderRadius: '7px', border: '1.5px solid #EF4444', backgroundColor: WHITE, color: '#EF4444', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Reject</button>
                  <button onClick={handleSubmit} disabled={submitting} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                    {submitting ? 'Submitting...' : 'Submit for Approval →'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: '10px', flex: 1, minHeight: 0 }}>
          {/* COL 1 — Queue */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To Review</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {invoices.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No invoices to review</div>
              ) : invoices.map(inv => (
                <div key={inv.id} onClick={() => selectInvoice(inv.id)} style={{ padding: '10px 12px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', backgroundColor: selected?.id === inv.id ? '#FEF3C7' : WHITE, borderLeft: selected?.id === inv.id ? `3px solid ${AMBER}` : '3px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.supplier_name ?? 'Unknown'}</div>
                    {inv.record_type === 'EXPENSE' && <span style={{ fontSize: '9px', fontWeight: '700', color: '#13B5EA', backgroundColor: '#EBF4FF', padding: '1px 5px', borderRadius: '6px', flexShrink: 0 }}>EXPENSE</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: MUTED, marginBottom: '3px' }}>{inv.invoice_number ?? inv.submitted_by?.split('@')[0] ?? '—'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: MUTED }}>{fmtDate(inv.invoice_date)}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: DARK }}>{fmt(inv.amount_incl)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Recently Completed */}
            <div style={{ borderTop: `1px solid ${BORDER}` }}>
              <button onClick={() => setShowCompleted(!showCompleted)} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed ({completedInvoices.length})</span>
                <span style={{ fontSize: '10px', color: MUTED }}>{showCompleted ? '▲' : '▼'}</span>
              </button>
              {showCompleted && (
                <div style={{ overflowY: 'auto', maxHeight: '200px' }}>
                  {completedInvoices.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: MUTED, fontSize: '11px' }}>No completed invoices</div>
                  ) : completedInvoices.map(inv => (
                    <div key={inv.id} onClick={() => selectInvoice(inv.id)} style={{ padding: '8px 12px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', opacity: selected?.id === inv.id ? 1 : 0.7, backgroundColor: selected?.id === inv.id ? '#F0FDF4' : 'transparent', borderLeft: selected?.id === inv.id ? '3px solid #5B6B2D' : '3px solid transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '500', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{inv.supplier_name ?? 'Unknown'}</div>
                        <span style={{ fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '6px', flexShrink: 0,
                          color: inv.status === 'PENDING_APPROVAL' ? '#92400E' : inv.status === 'XERO_PAID' ? '#065F46' : inv.status === 'XERO_POSTED' || inv.status === 'XERO_AUTHORISED' ? '#0D7A6E' : '#5B6B2D',
                          backgroundColor: inv.status === 'PENDING_APPROVAL' ? '#FEF3C7' : inv.status === 'XERO_PAID' ? '#D1FAE5' : inv.status === 'XERO_POSTED' || inv.status === 'XERO_AUTHORISED' ? '#E6F6F4' : '#F0FDF4',
                        }}>
                          {inv.status === 'PENDING_APPROVAL' ? 'PENDING' : inv.status === 'XERO_PAID' ? 'PAID' : inv.status === 'XERO_POSTED' || inv.status === 'XERO_AUTHORISED' ? 'POSTED' : 'APPROVED'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '10px', color: MUTED }}>{inv.invoice_number}</span>
                        <span style={{ fontSize: '10px', fontWeight: '600', color: DARK }}>{fmt(inv.amount_incl)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COL 2 — Detail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', minHeight: 0 }}>
            {!selected ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px' }}>Select an invoice to review</div>
            ) : loadingDetail ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
            ) : (
              <>
                {/* Compact header — editable fields */}
                <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '10px 14px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                      <input value={selected.supplier_name ?? ''} onChange={e => setSelected((p: any) => ({ ...p, supplier_name: e.target.value }))} onBlur={e => updateHeaderField('supplier_name', e.target.value)}
                        style={{ fontSize: '14px', fontWeight: 'bold', color: DARK, border: 'none', borderBottom: `1px dashed ${BORDER}`, outline: 'none', backgroundColor: 'transparent', padding: '0 2px', width: '140px' }} title="Edit supplier name" />
                      <input value={selected.invoice_number ?? ''} onChange={e => setSelected((p: any) => ({ ...p, invoice_number: e.target.value }))} onBlur={e => updateHeaderField('invoice_number', e.target.value)}
                        style={{ fontSize: '11px', color: MUTED, border: 'none', borderBottom: `1px dashed ${BORDER}`, outline: 'none', backgroundColor: 'transparent', padding: '0 2px', width: '100px' }} title="Edit invoice number" />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{fmt(selected.amount_incl)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>Date:</span>
                      <input type="date" value={selected.invoice_date ?? ''} onChange={e => updateHeaderField('invoice_date', e.target.value)}
                        style={{ fontSize: '11px', fontWeight: '600', color: DARK, border: 'none', borderBottom: `1px dashed ${BORDER}`, outline: 'none', backgroundColor: 'transparent', padding: '0 2px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>Due:</span>
                      <input type="date" value={selected.due_date ?? ''} onChange={e => updateHeaderField('due_date', e.target.value)}
                        style={{ fontSize: '11px', fontWeight: '600', color: DARK, border: 'none', borderBottom: `1px dashed ${BORDER}`, outline: 'none', backgroundColor: 'transparent', padding: '0 2px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>Excl:</span>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{fmt(selected.amount_excl)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>VAT:</span>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{fmt(selected.amount_vat)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '6px', backgroundColor: WHITE, color: DARK }}>
                      <option value="">— Select supplier —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` · ${s.vat_number}` : ''}</option>)}
                    </select>
                    {!selectedSupplier && (
                      <button onClick={() => { setNewSupplierName(selected?.supplier_name ?? ''); setShowCreateSupplier(true) }}
                        style={{ padding: '5px 10px', borderRadius: '6px', border: `1.5px solid #13B5EA`, backgroundColor: WHITE, color: '#13B5EA', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        + Xero
                      </button>
                    )}
                  </div>
                </div>

                {/* Return reason from approver */}
                {(() => {
                  const returnNote = auditTrail.find(e => e.to_status === 'RETURNED' && e.notes)
                  if (!returnNote) return null
                  return (
                    <div style={{ backgroundColor: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A', padding: '8px 12px', flexShrink: 0 }}>
                      <div style={{ fontSize: '9px', fontWeight: '700', color: AMBER, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Returned by Approver</div>
                      <div style={{ fontSize: '12px', color: DARK }}>{returnNote.notes}</div>
                      <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{returnNote.actor_email}</div>
                    </div>
                  )
                })()}

                {/* Xero Match Banner (desktop) */}
                <XeroMatchBanner invoiceId={selected.id} />

                {/* Header GL — apply to all lines */}
                <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '6px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Apply GL to all lines</span>
                  <div style={{ flex: 1 }}>
                    <SearchableSelect
                      compact
                      value={headerGl}
                      onChange={applyHeaderGl}
                      options={glCodes.map(g => ({ value: g.id, label: `${g.xero_account_code} · ${g.name}` }))}
                      placeholder="— Select to apply —"
                    />
                  </div>
                </div>

                {/* Line items — compact */}
                <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 40px 80px 80px 170px', padding: '6px 12px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
                    {['Description', 'Qty', 'Unit', 'Total', 'GL Code'].map(h => (
                      <div key={h} style={{ fontSize: '9px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                    ))}
                  </div>
                  {lines.map((line, i) => (
                    <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '2fr 40px 80px 80px 170px', padding: '6px 12px', borderBottom: i < lines.length - 1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: DARK, paddingRight: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={line.description}>{line.description}</div>
                      <div style={{ fontSize: '11px', color: DARK }}>{line.quantity}</div>
                      <div style={{ fontSize: '11px', color: DARK }}>{fmt(line.unit_price)}</div>
                      <div style={{ fontSize: '11px', fontWeight: '500', color: DARK }}>{fmt(line.line_total)}</div>
                      <SearchableSelect
                        compact
                        value={line.gl_code_id ?? line.gl_codes?.id ?? ''}
                        onChange={v => updateLine(i, 'gl_code_id', v)}
                        options={glCodes.map(g => ({ value: g.id, label: `${g.xero_account_code} · ${g.name}` }))}
                        placeholder="— GL —"
                      />
                    </div>
                  ))}
                  <div style={{ padding: '5px 12px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: '16px', backgroundColor: LIGHT }}>
                    <span style={{ fontSize: '10px', color: MUTED }}>Excl: {fmt(selected.amount_excl)}</span>
                    <span style={{ fontSize: '10px', color: MUTED }}>VAT: {fmt(selected.amount_vat)}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: DARK }}>Total: {fmt(selected.amount_incl)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '8px 12px', flexShrink: 0 }}>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Notes / Rejection reason</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for approver or rejection reason..." rows={2}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '6px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }} />
                </div>
              </>
            )}
          </div>

          {/* COL 3 — PDF */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Invoice PDF</span>
              {pdfUrl && (
                <button onClick={() => setShowPdf(true)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', color: MUTED }}>
                  ⛶ Fullscreen
                </button>
              )}
            </div>
            {pdfUrl ? (
              <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} title="Invoice PDF" />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px' }}>📄</div>
                <div>{selected ? 'PDF not available' : 'Select an invoice'}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Create Supplier Modal */}
      {showCreateSupplier && (
        <div onClick={() => !creatingSupplier && setShowCreateSupplier(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#F5F5F2', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#2A2A2A', margin: 0 }}>Create Supplier in Xero</h2>
              {!creatingSupplier && <button onClick={() => setShowCreateSupplier(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#8A8878', cursor: 'pointer' }}>×</button>}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#2A2A2A', marginBottom: '4px' }}>Supplier Name *</label>
              <input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1.5px solid #E2E0D8', borderRadius: '7px', boxSizing: 'border-box', outline: 'none', color: '#2A2A2A' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#2A2A2A', marginBottom: '4px' }}>Email (optional)</label>
              <input value={newSupplierEmail} onChange={e => setNewSupplierEmail(e.target.value)} type="email" placeholder="supplier@example.com"
                style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1.5px solid #E2E0D8', borderRadius: '7px', boxSizing: 'border-box', outline: 'none', color: '#2A2A2A' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#2A2A2A', marginBottom: '4px' }}>VAT Number (optional)</label>
              <input value={newSupplierVat} onChange={e => setNewSupplierVat(e.target.value)} placeholder="4XXXXXXXXX"
                style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1.5px solid #E2E0D8', borderRadius: '7px', boxSizing: 'border-box', outline: 'none', color: '#2A2A2A' }} />
            </div>
            {createError && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#C0392B' }}>{createError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowCreateSupplier(false)} disabled={creatingSupplier}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1.5px solid #E2E0D8', backgroundColor: '#fff', color: '#8A8878', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateSupplier} disabled={creatingSupplier || !newSupplierName}
                style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: creatingSupplier || !newSupplierName ? '#94A3B8' : '#13B5EA', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                {creatingSupplier ? 'Creating...' : 'Create in Xero →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
