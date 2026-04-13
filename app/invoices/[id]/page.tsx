'use client'

import { useEffect, useState, memo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import XeroMatchBanner from '@/components/XeroMatchBanner'

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
  EXTRACTION_FAILED: { color: RED,       bg: '#FEE2E2', label: 'Extraction Failed' },
  PENDING_REVIEW:    { color: AMBER,     bg: '#FEF3C7', label: 'Pending Review' },
  IN_REVIEW:         { color: '#3B82F6', bg: '#EBF4FF', label: 'In Review' },
  PENDING_APPROVAL:  { color: '#8B5CF6', bg: '#F5F3FF', label: 'Pending Approval' },
  APPROVED:          { color: OLIVE,     bg: '#F0FDF4', label: 'Approved' },
  REJECTED:          { color: RED,       bg: '#FEE2E2', label: 'Rejected' },
  RETURNED:          { color: AMBER,     bg: '#FEF3C7', label: 'Returned' },
  XERO_POSTED:       { color: '#0D7A6E', bg: '#E6F6F4', label: 'Xero Posted' },
  XERO_AUTHORISED:   { color: '#166534', bg: '#DCFCE7', label: 'Authorised' },
  XERO_PAID:         { color: '#166534', bg: '#DCFCE7', label: 'Paid' },
  XERO_PUSH_FAILED:  { color: RED,       bg: '#FEE2E2', label: 'Push Failed' },
  XERO_LINKED:       { color: '#0D7A6E', bg: '#E6F6F4', label: 'Linked to Xero' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'
const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDT = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

// External memo — line items table, no focus issues
const LineItemsTable = memo(function LineItemsTable({ lines, glCodes, canReview, onUpdateLine }: {
  lines: any[]; glCodes: any[]; canReview: boolean
  onUpdateLine: (i: number, field: string, value: any) => void
}) {
  return (
    <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 50px 90px 90px 180px', padding: '8px 12px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
        {['Description', 'Qty', 'Unit', 'Total', 'GL Code'].map(h => (
          <div key={h} style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
        ))}
      </div>
      {lines.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No line items extracted.</div>
      ) : lines.map((line, i) => (
        <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '2fr 50px 90px 90px 180px', padding: '8px 12px', borderBottom: i < lines.length - 1 ? `1px solid ${LIGHT}` : 'none', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: DARK, paddingRight: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={line.description}>{line.description}</div>
          <div style={{ fontSize: '12px', color: DARK }}>{line.quantity}</div>
          <div style={{ fontSize: '12px', color: DARK }}>{fmt(line.unit_price)}</div>
          <div style={{ fontSize: '12px', fontWeight: '500', color: DARK }}>{fmt(line.line_total)}</div>
          {canReview ? (
            <select value={line.gl_code_id ?? line.gl_codes?.id ?? ''} onChange={e => onUpdateLine(i, 'gl_code_id', e.target.value)}
              style={{ padding: '4px 6px', fontSize: '11px', border: `1px solid ${BORDER}`, borderRadius: '5px', backgroundColor: WHITE, color: DARK, width: '100%' }}>
              <option value="">— GL —</option>
              {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: '11px', color: line.gl_codes ? OLIVE : MUTED }}>
              {line.gl_codes ? `${line.gl_codes.xero_account_code} · ${line.gl_codes.name}` : '—'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
})

export default function InvoiceDetailPage() {
  const { id }   = useParams()
  const router   = useRouter()
  const isMobile = useIsMobile()

  const [invoice, setInvoice]           = useState<any>(null)
  const [lines, setLines]               = useState<any[]>([])
  const [glCodes, setGlCodes]           = useState<any[]>([])
  const [suppliers, setSuppliers]       = useState<any[]>([])
  const [pdfUrl, setPdfUrl]             = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [notes, setNotes]               = useState('')
  const [auditTrail, setAuditTrail]     = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [showPdf, setShowPdf]           = useState(false)
  const [showAudit, setShowAudit]       = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ data: inv }, { data: lineData }, { data: glData }, { data: audit }, { data: suppData }] = await Promise.all([
        supabase.from('invoices').select('id, status, supplier_id, supplier_name, invoice_number, invoice_date, due_date, amount_excl, amount_vat, amount_incl, currency, notes, storage_path, rejection_reason, record_type, submitted_by').eq('id', id).single(),
        supabase.from('invoice_line_items').select('*, gl_codes(id, xero_account_code, name)').eq('invoice_id', id).order('sort_order'),
        supabase.from('gl_codes').select('id, xero_account_code, name').eq('is_active', true).order('xero_account_code'),
        supabase.from('audit_trail').select('id, from_status, to_status, actor_email, notes, created_at').eq('invoice_id', id).order('created_at'),
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
    } catch (err) {
      console.error('[invoice-detail] Failed to load:', err)
    }
    setLoading(false)
  }

  const [reextracting, setReextracting] = useState(false)

  const handleReextract = async () => {
    if (!id) return
    setReextracting(true)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id, reextract: true }),
      })
      const data = await res.json()
      if (data.error) alert(`Re-extraction failed: ${data.error}`)
      else await fetchData()
    } catch (err: any) { alert(`Re-extraction failed: ${err.message}`) }
    setReextracting(false)
  }

  const updateLine = (index: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    await supabase.from('invoices').update({ status: 'PENDING_APPROVAL', supplier_id: selectedSupplier || null, notes: notes || invoice?.notes }).eq('id', id)
    for (const line of lines) {
      await supabase.from('invoice_line_items').update({ gl_code_id: line.gl_code_id ?? line.gl_codes?.id }).eq('id', line.id)
    }
    await supabase.from('audit_trail').insert({
      invoice_id: id, from_status: invoice?.status, to_status: 'PENDING_APPROVAL',
      actor_email: (await supabase.auth.getUser()).data.user?.email,
      notes: notes || 'Submitted for approval',
    })
    router.push('/invoices')
  }

  const handleReject = async () => {
    if (!notes) { alert('Please add a rejection reason.'); return }
    setSubmitting(true)
    await supabase.from('invoices').update({ status: 'REJECTED', rejection_reason: notes }).eq('id', id)
    await supabase.from('audit_trail').insert({
      invoice_id: id, from_status: invoice?.status, to_status: 'REJECTED',
      actor_email: (await supabase.auth.getUser()).data.user?.email, notes,
    })
    router.push('/invoices')
  }

  if (loading) return <AppShell><div style={{ padding: '60px', textAlign: 'center', color: MUTED }}>Loading...</div></AppShell>
  if (!invoice) return <AppShell><div style={{ padding: '60px', textAlign: 'center', color: MUTED }}>Invoice not found.</div></AppShell>

  const statusStyle = STATUS_STYLES[invoice.status] ?? STATUS_STYLES['INGESTED']
  const canReview   = ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED'].includes(invoice.status)

  // ── FULLSCREEN PDF MODAL ─────────────────────────────────────
  const PdfModal = () => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: DARK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0 }}>
        <span style={{ color: WHITE, fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
          {invoice.supplier_name} — {invoice.invoice_number}
        </span>
        <button onClick={() => setShowPdf(false)} style={{ background: 'none', border: 'none', color: WHITE, fontSize: '26px', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <iframe src={pdfUrl!} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF" />
    </div>
  )

  // ── MOBILE ───────────────────────────────────────────────────
  if (isMobile) {
    return (
      <AppShell>
        {showPdf && pdfUrl && <PdfModal />}

        <div style={{ paddingBottom: canReview ? '90px' : '20px' }}>
          {/* Back */}
          <button onClick={() => router.push('/invoices')}
            style={{ background: 'none', border: 'none', color: MUTED, fontSize: '13px', cursor: 'pointer', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            ← Back to invoices
          </button>

          {/* Compact header card */}
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '14px 16px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {invoice.supplier_name ?? 'Unknown Supplier'}
                </div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>{invoice.invoice_number ?? '—'}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: DARK }}>{fmt(invoice.amount_incl)}</div>
                <span style={{ fontSize: '10px', fontWeight: '600', color: statusStyle.color, backgroundColor: statusStyle.bg, padding: '2px 8px', borderRadius: '8px', display: 'inline-block', marginTop: '3px' }}>
                  {statusStyle.label}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Date',  value: fmtDate(invoice.invoice_date) },
                { label: 'Due',   value: fmtDate(invoice.due_date) },
                { label: 'Excl',  value: fmt(invoice.amount_excl) },
                { label: 'VAT',   value: fmt(invoice.amount_vat) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>{label}:</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Xero Match Banner (mobile) */}
          <div style={{ marginBottom: '10px' }}>
            <XeroMatchBanner invoiceId={invoice.id} />
          </div>

          {/* PDF button */}
          {pdfUrl && (
            <button onClick={() => setShowPdf(true)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              📄 View Invoice PDF
            </button>
          )}

          {/* Supplier select — only when can review */}
          {canReview && (
            <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '12px 14px', marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Supplier</label>
              <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', backgroundColor: WHITE, color: DARK }}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` · ${s.vat_number}` : ''}</option>)}
              </select>
            </div>
          )}

          {/* Line items — mobile simplified */}
          {lines.length > 0 && (
            <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Line Items ({lines.length})
              </div>
              {lines.map((line, i) => (
                <div key={line.id} style={{ padding: '10px 14px', borderBottom: i < lines.length - 1 ? `1px solid ${LIGHT}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: DARK, flex: 1, paddingRight: '8px' }}>{line.description}</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: DARK, flexShrink: 0 }}>{fmt(line.line_total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: MUTED }}>Qty: {line.quantity} × {fmt(line.unit_price)}</span>
                    {canReview ? (
                      <select value={line.gl_code_id ?? line.gl_codes?.id ?? ''} onChange={e => updateLine(i, 'gl_code_id', e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '11px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: WHITE, color: DARK, maxWidth: '160px' }}>
                        <option value="">— GL —</option>
                        {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: line.gl_codes ? OLIVE : MUTED }}>
                        {line.gl_codes ? `${line.gl_codes.xero_account_code} · ${line.gl_codes.name}` : '— No GL'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ padding: '8px 14px', backgroundColor: LIGHT, display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
                <span style={{ fontSize: '11px', color: MUTED }}>Excl: {fmt(invoice.amount_excl)}</span>
                <span style={{ fontSize: '11px', color: MUTED }}>VAT: {fmt(invoice.amount_vat)}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>Total: {fmt(invoice.amount_incl)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {canReview && (
            <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '12px 14px', marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes / Rejection reason</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for approver or rejection reason..." rows={3}
                style={{ width: '100%', padding: '10px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }} />
            </div>
          )}

          {/* Audit trail — collapsible */}
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '10px' }}>
            <button onClick={() => setShowAudit(!showAudit)}
              style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: LIGHT }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audit Trail ({auditTrail.length})</span>
              <span style={{ fontSize: '14px', color: MUTED, transform: showAudit ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
            </button>
            {showAudit && auditTrail.map((entry, i) => (
              <div key={entry.id} style={{ padding: '10px 14px', borderTop: `1px solid ${LIGHT}`, display: 'flex', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: AMBER, flexShrink: 0, marginTop: '5px' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: DARK }}>{entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{entry.actor_email} · {fmtDT(entry.created_at)}</div>
                  {entry.notes && <div style={{ fontSize: '12px', color: DARK, marginTop: '2px', fontStyle: 'italic' }}>{entry.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Re-scan for stuck invoices (mobile) */}
        {!canReview && (
          <div style={{ padding: '12px 0' }}>
            <button onClick={handleReextract} disabled={reextracting} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {reextracting ? 'Extracting...' : '🔄 Re-scan Invoice'}
            </button>
          </div>
        )}

        {/* Sticky action buttons */}
        {canReview && (
          <div style={{ position: 'fixed', bottom: '60px', left: 0, right: 0, padding: '10px 16px', backgroundColor: WHITE, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '10px', zIndex: 50 }}>
            <button onClick={handleReject} disabled={submitting}
              style={{ flex: 1, padding: '13px', borderRadius: '10px', border: '2px solid #EF4444', backgroundColor: WHITE, color: RED, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Reject
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ flex: 2, padding: '13px', borderRadius: '10px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              {submitting ? 'Submitting...' : 'Submit for Approval →'}
            </button>
          </div>
        )}
      </AppShell>
    )
  }

  // ── DESKTOP ──────────────────────────────────────────────────
  return (
    <AppShell>
      {showPdf && pdfUrl && <PdfModal />}

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
          <div>
            <button onClick={() => router.push('/invoices')} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '12px', cursor: 'pointer', padding: '0 0 4px', display: 'block' }}>← Back to invoices</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: 0 }}>{invoice.supplier_name ?? 'Unknown'}</h1>
              <span style={{ fontSize: '13px', color: MUTED }}>{invoice.invoice_number ?? '—'}</span>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontSize: '11px', fontWeight: '600' }}>{statusStyle.label}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleReextract} disabled={reextracting} style={{ padding: '8px 14px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              {reextracting ? 'Extracting...' : '🔄 Re-scan'}
            </button>
            {canReview && (
              <>
                <button onClick={handleReject} disabled={submitting} style={{ padding: '8px 16px', borderRadius: '7px', border: '1.5px solid #EF4444', backgroundColor: WHITE, color: RED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Reject</button>
                <button onClick={handleSubmit} disabled={submitting} style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                  {submitting ? 'Submitting...' : 'Submit for Approval →'}
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: '12px', flex: 1, minHeight: 0 }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', minHeight: 0 }}>
            {/* Invoice summary */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 14px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{invoice.supplier_name ?? '—'}</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: DARK }}>{fmt(invoice.amount_incl)}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[{ label: 'Date', value: fmtDate(invoice.invoice_date) }, { label: 'Due', value: fmtDate(invoice.due_date) }, { label: 'Excl', value: fmt(invoice.amount_excl) }, { label: 'VAT', value: fmt(invoice.amount_vat) }].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', gap: '3px' }}>
                    <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>{label}:</span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{value}</span>
                  </div>
                ))}
              </div>
              {canReview && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${LIGHT}` }}>
                  <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '6px', backgroundColor: WHITE, color: DARK }}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.vat_number ? ` · ${s.vat_number}` : ''}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Xero Match Banner (desktop) */}
            <XeroMatchBanner invoiceId={invoice.id} />

            {/* Line items */}
            <LineItemsTable lines={lines} glCodes={glCodes} canReview={canReview} onUpdateLine={updateLine} />

            {/* Notes */}
            {canReview && (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '10px 12px', flexShrink: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Notes / Rejection reason</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for approver or rejection reason..." rows={2}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '6px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }} />
              </div>
            )}

            {/* Audit trail */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => setShowAudit(!showAudit)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: LIGHT }}>
                <span style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audit Trail ({auditTrail.length})</span>
                <span style={{ fontSize: '12px', color: MUTED, transform: showAudit ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
              </button>
              {showAudit && auditTrail.map((entry, i) => (
                <div key={entry.id} style={{ padding: '8px 12px', borderTop: `1px solid ${LIGHT}`, display: 'flex', gap: '8px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: AMBER, flexShrink: 0, marginTop: '4px' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}</div>
                    <div style={{ fontSize: '10px', color: MUTED }}>{entry.actor_email} · {fmtDT(entry.created_at)}</div>
                    {entry.notes && <div style={{ fontSize: '11px', color: DARK, fontStyle: 'italic', marginTop: '1px' }}>{entry.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — PDF */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Invoice PDF</span>
              {pdfUrl && <button onClick={() => setShowPdf(true)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', color: MUTED }}>⛶ Fullscreen</button>}
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
