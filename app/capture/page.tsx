'use client'

import { useEffect, useState, useRef, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'

// ── Capture Form — external memo, owns all its state ─────────────
const CaptureForm = memo(function CaptureForm({ glCodes, costCentres, userEmail, onSubmit, submitting }: {
  glCodes: any[]; costCentres: any[]; userEmail: string
  onSubmit: (data: any, file: File) => Promise<void>
  submitting: boolean
}) {
  const [file, setFile]               = useState<File | null>(null)
  const [preview, setPreview]         = useState<string | null>(null)
  const [extracting, setExtracting]   = useState(false)
  const [vendorName, setVendorName]   = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [amountExcl, setAmountExcl]   = useState('')
  const [amountVat, setAmountVat]     = useState('')
  const [amountIncl, setAmountIncl]   = useState('')
  const [glCodeId, setGlCodeId]       = useState('')
  const [costCentreId, setCostCentreId] = useState('')
  const [clientName, setClientName]   = useState('')
  const [notes, setNotes]             = useState('')
  const [extracted, setExtracted]     = useState(false)
  const [error, setError]             = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setExtracted(false)
    setError('')
    // Auto-extract
    setExtracting(true)
    try {
      const formData = new FormData()
      formData.append('file', f)
      const res  = await fetch('/api/expenses/extract', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.vendor_name)  setVendorName(data.vendor_name)
      if (data.receipt_date) setReceiptDate(data.receipt_date)
      if (data.amount_excl)  setAmountExcl(String(data.amount_excl))
      if (data.amount_vat)   setAmountVat(String(data.amount_vat))
      if (data.amount_incl)  setAmountIncl(String(data.amount_incl))
      if (data.suggested_gl_id) setGlCodeId(data.suggested_gl_id)
      setExtracted(true)
    } catch (err) {
      setError('Could not extract receipt data. Please fill in manually.')
    }
    setExtracting(false)
  }

  const handleSubmit = async () => {
    if (!file || !vendorName || !amountIncl) {
      setError('Please attach a receipt, enter vendor name and total amount.')
      return
    }
    await onSubmit({
      vendor_name: vendorName, receipt_date: receiptDate,
      amount_excl: parseFloat(amountExcl) || null,
      amount_vat:  parseFloat(amountVat)  || null,
      amount_incl: parseFloat(amountIncl),
      gl_code_id:  glCodeId || null,
      cost_centre_id: costCentreId || null,
      client_name: clientName || null,
      notes: notes || null,
      submitted_by: userEmail,
    }, file)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: '16px',
    border: `1.5px solid ${BORDER}`, borderRadius: '8px',
    outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: WHITE,
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '5px',
  }

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto' }}>
      {/* Receipt upload */}
      <div style={{ marginBottom: '16px' }}>
        <div onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${file ? OLIVE : BORDER}`, borderRadius: '12px', padding: '20px', textAlign: 'center', cursor: 'pointer', backgroundColor: file ? '#F0FDF4' : LIGHT, position: 'relative', overflow: 'hidden' }}>
          {preview ? (
            <img src={preview} alt="receipt" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain' }} />
          ) : (
            <>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📷</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '4px' }}>Tap to photograph receipt</div>
              <div style={{ fontSize: '12px', color: MUTED }}>JPG, PNG or PDF accepted</div>
            </>
          )}
          {extracting && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🤖</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>Extracting receipt data...</div>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment"
          onChange={handleFileChange} style={{ display: 'none' }} />
        {file && !extracting && (
          <button onClick={() => fileRef.current?.click()}
            style={{ marginTop: '8px', background: 'none', border: 'none', color: AMBER, fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            Change photo
          </button>
        )}
      </div>

      {/* Extracted badge */}
      {extracted && (
        <div style={{ backgroundColor: '#F0FDF4', border: `1px solid #BBF7D0`, borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: OLIVE, fontWeight: '600' }}>
          ✓ Receipt data extracted — vendor, amounts and GL code pre-filled. Please review and confirm.
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: RED }}>{error}</div>
      )}

      {/* Form fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Vendor / Supplier *</label>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. Woolworths" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Receipt Date</label>
            <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Total Amount (incl. VAT) *</label>
            <input type="number" value={amountIncl} onChange={e => setAmountIncl(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Amount excl. VAT</label>
            <input type="number" value={amountExcl} onChange={e => setAmountExcl(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>VAT Amount</label>
            <input type="number" value={amountVat} onChange={e => setAmountVat(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>GL Code / Expense Category</label>
          <select value={glCodeId} onChange={e => setGlCodeId(e.target.value)} style={{ ...inputStyle, backgroundColor: WHITE }}>
            <option value="">— Select GL code —</option>
            {glCodes.map(g => <option key={g.id} value={g.id}>{g.xero_account_code} · {g.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Cost Centre</label>
          <select value={costCentreId} onChange={e => setCostCentreId(e.target.value)} style={{ ...inputStyle, backgroundColor: WHITE }}>
            <option value="">— Select cost centre —</option>
            {costCentres.map(cc => <option key={cc.id} value={cc.id}>{cc.name}{cc.code ? ` (${cc.code})` : ''}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Client (optional)</label>
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name if applicable" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Purpose of expense..." style={inputStyle} />
        </div>

        <button onClick={handleSubmit} disabled={submitting || !file || !vendorName || !amountIncl}
          style={{ padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: submitting || !file || !vendorName || !amountIncl ? '#C8B89A' : AMBER, color: WHITE, fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginTop: '4px' }}>
          {submitting ? 'Submitting...' : 'Submit Expense →'}
        </button>
      </div>
    </div>
  )
})

// ── Main page ────────────────────────────────────────────────────
export default function CapturePage() {
  const [glCodes, setGlCodes]         = useState<any[]>([])
  const [costCentres, setCostCentres] = useState<any[]>([])
  const [userEmail, setUserEmail]     = useState('')
  const [canCapture, setCanCapture]   = useState<boolean | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')
      const { data: profile } = await supabase.from('user_profiles').select('can_capture_expenses').eq('email', user.email).maybeSingle()
      setCanCapture(profile?.can_capture_expenses ?? false)
      const [{ data: gl }, { data: cc }] = await Promise.all([
        supabase.from('gl_codes').select('id, xero_account_code, name').eq('is_active', true).order('xero_account_code'),
        supabase.from('cost_centres').select('id, name, code').eq('is_active', true).order('name'),
      ])
      setGlCodes(gl ?? [])
      setCostCentres(cc ?? [])
    }
    load()
  }, [])

  const handleSubmit = async (data: any, file: File) => {
    setSubmitting(true)
    try {
      // Upload file to Supabase storage
      const ext      = file.name.split('.').pop()
      const fileName = `expenses/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(fileName, file, { contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(fileName)

      // Create invoice record as EXPENSE type
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          record_type:    'EXPENSE',
          status:         'PENDING_REVIEW',
          supplier_name:  data.vendor_name,
          invoice_date:   data.receipt_date || new Date().toISOString().split('T')[0],
          amount_excl:    data.amount_excl,
          amount_vat:     data.amount_vat,
          amount_incl:    data.amount_incl,
          submitted_by:   data.submitted_by,
          cost_centre_id: data.cost_centre_id,
          client_name:    data.client_name,
          notes:          data.notes,
          pdf_url:        publicUrl,
          currency:       'ZAR',
        })
        .select('id')
        .single()

      if (invoiceError) throw new Error(invoiceError.message)

      // Add GL code as line item if provided
      if (data.gl_code_id && invoice) {
        await supabase.from('invoice_line_items').insert({
          invoice_id:  invoice.id,
          description: data.notes || data.vendor_name,
          line_total:  data.amount_excl || data.amount_incl,
          vat_rate:    data.amount_vat ? 15 : 0,
          gl_code_id:  data.gl_code_id,
          sort_order:  0,
        })
      }

      // Audit trail
      await supabase.from('audit_trail').insert({
        invoice_id:  invoice.id,
        from_status: null,
        to_status:   'PENDING_REVIEW',
        actor_email: data.submitted_by,
        notes:       `Expense submitted by ${data.submitted_by}`,
      })

      setSuccess(true)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
    setSubmitting(false)
  }

  if (canCapture === null) return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: MUTED, fontSize: '13px' }}>Loading...</div>
    </AppShell>
  )

  if (!canCapture) return (
    <AppShell>
      <div style={{ maxWidth: '400px', margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: DARK, marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>You don't have permission to capture expenses. Contact your administrator.</p>
        <button onClick={() => router.push('/')} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
          Go Home
        </button>
      </div>
    </AppShell>
  )

  if (success) return (
    <AppShell>
      <div style={{ maxWidth: '400px', margin: '60px auto', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', backgroundColor: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px' }}>✓</div>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: DARK, marginBottom: '8px' }}>Expense Submitted</h2>
        <p style={{ fontSize: '13px', color: MUTED, marginBottom: '28px' }}>Your expense has been submitted for review. You'll be notified once it's approved.</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={() => setSuccess(false)} style={{ padding: '11px 20px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Submit Another
          </button>
          <button onClick={() => router.push('/expenses')} style={{ padding: '11px 20px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
            View Expenses
          </button>
        </div>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Capture Expense</h1>
        <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Photograph your receipt and fill in the details</p>
      </div>
      <CaptureForm
        glCodes={glCodes} costCentres={costCentres} userEmail={userEmail}
        onSubmit={handleSubmit} submitting={submitting}
      />
    </AppShell>
  )
}
