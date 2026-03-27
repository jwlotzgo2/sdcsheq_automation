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

export default function ApprovePage() {
  const [invoices, setInvoices]           = useState<any[]>([])
  const [selected, setSelected]           = useState<any>(null)
  const [lines, setLines]                 = useState<any[]>([])
  const [glCodes, setGlCodes]             = useState<any[]>([])
  const [pdfUrl, setPdfUrl]               = useState<string | null>(null)
  const [auditTrail, setAuditTrail]       = useState<any[]>([])
  const [notes, setNotes]                 = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [mobileView, setMobileView]       = useState<'list' | 'detail'>('list')
  const [showPdf, setShowPdf]             = useState(false)
  const [showAudit, setShowAudit]         = useState(false)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchInvoices() }, [])
  useEffect(() => { if (glCodes.length === 0) fetchGlCodes() }, [])

  const fetchInvoices = async () => {
    const { data } = await supabase.from('invoices').select('id, status, supplier_name, invoice_number, invoice_date, amount_incl, created_at').eq('status', 'PENDING_APPROVAL').order('created_at', { ascending: false })
    setInvoices(data ?? [])
    if (data && data.length > 0 && !isMobile) selectInvoice(data[0].id)
  }

  const fetchGlCodes = async () => {
    const { data } = await supabase.from('gl_codes').select('id, xero_account_code, name').eq('is_active', true).order('xero_account_code')
    setGlCodes(data ?? [])
  }

  const selectInvoice = async (id: string) => {
    setLoadingDetail(true); setPdfUrl(null); setNotes('')
    if (isMobile) setMobileView('detail')

    const [{ data: inv }, { data: lineData }, { data: audit }] = await Promise.all([
      supabase.from('invoices').select('*, suppliers(name, vat_number)').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*, gl_codes(id, xero_account_code, name)').eq('invoice_id', id).order('sort_order'),
      supabase.from('audit_trail').select('*').eq('invoice_id', id).order('created_at'),
    ])
    setSelected(inv); setLines(lineData ?? []); setAuditTrail(audit ?? [])

    if (inv?.storage_path) {
      const path = inv.storage_path.replace('invoices/', '')
      const { data: urlData } = await supabase.storage.from('invoices').createSignedUrl(path, 3600)
      if (urlData) setPdfUrl(urlData.signedUrl)
    }
    setLoadingDetail(false)
  }

  const updateLine = (index: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  const handleAction = async (actionType: 'approve' | 'return' | 'reject') => {
    if (!selected) return
    if ((actionType === 'return' || actionType === 'reject') && !notes) {
      alert(`Please add a ${actionType === 'return' ? 'return reason' : 'rejection reason'}.`); return
    }
    setSubmitting(true)
    const user = (await supabase.auth.getUser()).data.user
    const statusMap = { approve: 'APPROVED', return: 'RETURNED', reject: 'REJECTED' }
    const newStatus = statusMap[actionType]

    for (const line of lines) {
      await supabase.from('invoice_line_items').update({ gl_code_id: line.gl_code_id ?? line.gl_codes?.id }).eq('id', line.id)
    }
    await supabase.from('invoices').update({
      status: newStatus,
      ...(actionType === 'reject' ? { rejection_reason: notes } : {}),
    }).eq('id', selected.id)
    await supabase.from('audit_trail').insert({
      invoice_id: selected.id, from_status: 'PENDING_APPROVAL', to_status: newStatus,
      actor_email: user?.email, notes: notes || (actionType === 'approve' ? 'Approved' : ''),
    })

    const remaining = invoices.filter(i => i.id !== selected.id)
    setInvoices(remaining); setSubmitting(false); setNotes('')
    if (isMobile) setMobileView('list')
    if (remaining.length > 0) { if (!isMobile) selectInvoice(remaining[0].id) }
    else { setSelected(null); setLines([]) }
  }

  // Find reviewer note — the submission to PENDING_APPROVAL
  const reviewerNote = auditTrail
    .filter(e => e.to_status === 'PENDING_APPROVAL' && e.actor_email !== 'system')
    .slice(-1)[0]

  // Also check invoice notes field
  const invoiceNote = selected?.notes && selected.notes !== `Subject: ${selected?.postmark_message_id}` ? selected.notes : null

  const DetailContent = () => (
    <>
      {/* Compact header */}
      <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: DARK }}>{selected.supplier_name ?? 'Unknown'}</span>
            <span style={{ fontSize: '11px', color: MUTED, marginLeft: '8px' }}>{selected.invoice_number}</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: '700', color: DARK }}>{fmt(selected.amount_incl)}</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {[{ label: 'Date', value: fmtDate(selected.invoice_date) }, { label: 'Due', value: fmtDate(selected.due_date) }, { label: 'Excl', value: fmt(selected.amount_excl) }, { label: 'VAT', value: fmt(selected.amount_vat) }].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: MUTED, fontWeight: '600', textTransform: 'uppercase' }}>{label}:</span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reviewer note — show even if just "Submitted for approval" if there's an invoice note */}
      {(reviewerNote || invoiceNote) && (
        <div style={{ backgroundColor: '#FEF3C7', borderRadius: '8px', border: `1px solid #FDE68A`, padding: '10px 14px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: AMBER, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            📋 Reviewer Note
          </div>
          <div style={{ fontSize: '13px', color: DARK }}>{reviewerNote?.notes && reviewerNote.notes !== 'Submitted for approval' ? reviewerNote.notes : invoiceNote ?? '(No specific note added — invoice submitted for approval)'}</div>
          {reviewerNote && <div style={{ fontSize: '10px', color: MUTED, marginTop: '3px' }}>{reviewerNote.actor_email} · {fmtDT(reviewerNote.created_at)}</div>}
        </div>
      )}

      {/* Line items */}
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
            <select value={line.gl_code_id ?? line.gl_codes?.id ?? ''} onChange={e => updateLine(i, 'gl_code_id', e.target.value)}
              style={{ padding: '3px 5px', fontSize: '10px', border: `1px solid ${BORDER}`, borderRadius: '4px', backgroundColor: WHITE, color: DARK, width: '100%' }}>
              <option value="">— GL —</option>
              {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
            </select>
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
        <label style={{ display: 'block', fontSize: '9px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          Notes <span style={{ color: '#EF4444' }}>*required for Return or Reject</span>
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add approval note, return reason, or rejection reason..." rows={2}
          style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1.5px solid ${BORDER}`, borderRadius: '6px', resize: 'none', boxSizing: 'border-box', color: DARK, fontFamily: 'Arial, sans-serif' }} />
      </div>

      {/* Audit trail — collapsible */}
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
              {entry.notes && <div style={{ fontSize: '11px', color: DARK, marginTop: '2px', fontStyle: 'italic' }}>{entry.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  )

  // ── MOBILE ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <AppShell>
        {showPdf && pdfUrl && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: DARK, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: DARK, flexShrink: 0 }}>
              <span style={{ color: WHITE, fontWeight: '600', fontSize: '14px' }}>Invoice PDF</span>
              <button onClick={() => setShowPdf(false)} style={{ background: 'none', border: 'none', color: WHITE, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF" />
          </div>
        )}

        {mobileView === 'list' && (
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Approval Queue</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 16px' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} awaiting approval</p>
            {invoices.length === 0 ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No invoices pending approval</div>
            ) : (
              <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                {invoices.map((inv, i) => (
                  <div key={inv.id} onClick={() => selectInvoice(inv.id)} style={{ padding: '16px', borderBottom: i < invoices.length - 1 ? `1px solid ${LIGHT}` : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        {mobileView === 'detail' && selected && (
          <div style={{ paddingBottom: '100px' }}>
            <button onClick={() => setMobileView('list')} style={{ background: 'none', border: 'none', color: AMBER, fontSize: '14px', fontWeight: '600', cursor: 'pointer', padding: '0 0 16px' }}>‹ All Invoices</button>
            {loadingDetail ? (
              <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <DetailContent />
                {pdfUrl && (
                  <button onClick={() => setShowPdf(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    📄 View Invoice PDF
                  </button>
                )}
              </div>
            )}
            <div style={{ position: 'fixed', bottom: '60px', left: 0, right: 0, padding: '10px 16px', backgroundColor: WHITE, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '8px', zIndex: 50 }}>
              <button onClick={() => handleAction('reject')} disabled={submitting} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '2px solid #EF4444', backgroundColor: WHITE, color: '#EF4444', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Reject</button>
              <button onClick={() => handleAction('return')} disabled={submitting} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${AMBER}`, backgroundColor: WHITE, color: AMBER, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Return</button>
              <button onClick={() => handleAction('approve')} disabled={submitting} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>✓ Approve</button>
            </div>
          </div>
        )}
      </AppShell>
    )
  }

  // ── DESKTOP ──────────────────────────────────────────────────────
  return (
    <AppShell>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: DARK, margin: '0 0 2px' }}>Approval Queue</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} awaiting approval</p>
          </div>
          {selected && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handleAction('reject')} disabled={submitting} style={{ padding: '7px 14px', borderRadius: '7px', border: '1.5px solid #EF4444', backgroundColor: WHITE, color: '#EF4444', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Reject</button>
              <button onClick={() => handleAction('return')} disabled={submitting} style={{ padding: '7px 14px', borderRadius: '7px', border: `1.5px solid ${AMBER}`, backgroundColor: WHITE, color: AMBER, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Return to Reviewer</button>
              <button onClick={() => handleAction('approve')} disabled={submitting} style={{ padding: '7px 20px', borderRadius: '7px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>{submitting ? 'Processing...' : '✓ Approve'}</button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: '10px', flex: 1, minHeight: 0 }}>
          {/* COL 1 */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Approval</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {invoices.length === 0 ? <div style={{ padding: '24px 12px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No invoices pending approval</div> :
                invoices.map(inv => (
                  <div key={inv.id} onClick={() => selectInvoice(inv.id)} style={{ padding: '10px 12px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', backgroundColor: selected?.id === inv.id ? '#F0FDF4' : WHITE, borderLeft: selected?.id === inv.id ? `3px solid ${OLIVE}` : '3px solid transparent' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.supplier_name ?? 'Unknown'}</div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '3px' }}>{inv.invoice_number ?? '—'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: MUTED }}>{fmtDate(inv.invoice_date)}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: DARK }}>{fmt(inv.amount_incl)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* COL 2 — Detail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', minHeight: 0 }}>
            {!selected ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px' }}>Select an invoice to approve</div>
            ) : loadingDetail ? (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
            ) : <DetailContent />}
          </div>

          {/* COL 3 — PDF */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Invoice PDF</span>
              {pdfUrl && <button onClick={() => setShowPdf(true)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer', color: MUTED }}>⛶ Fullscreen</button>}
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
    </AppShell>
  )
}
