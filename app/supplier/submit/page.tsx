'use client'

import { useEffect, useState, useRef, memo } from 'react'
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
const RED    = '#EF4444'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', fontSize: '15px',
  border: `1.5px solid ${BORDER}`, borderRadius: '8px',
  outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: WHITE,
}

const SubmitForm = memo(function SubmitForm({ supplierId, userEmail, onSuccess }: {
  supplierId: string; userEmail: string; onSuccess: () => void
}) {
  const [file, setFile]               = useState<File | null>(null)
  const [preview, setPreview]         = useState<string | null>(null)
  const [extracting, setExtracting]   = useState(false)
  const [extracted, setExtracted]     = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate]         = useState('')
  const [amountExcl, setAmountExcl]   = useState('')
  const [amountVat, setAmountVat]     = useState('')
  const [amountIncl, setAmountIncl]   = useState('')
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
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
    if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f))
    else setPreview(null)
    setExtracted(false); setError('')

    // Auto-extract
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res  = await fetch('/api/expenses/extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.vendor_name)    {} // We already know the supplier
      if (data.receipt_date)   setInvoiceDate(data.receipt_date)
      if (data.amount_excl)    setAmountExcl(String(data.amount_excl))
      if (data.amount_vat)     setAmountVat(String(data.amount_vat))
      if (data.amount_incl)    setAmountIncl(String(data.amount_incl))
      setExtracted(true)
    } catch { setError('Could not extract data. Please fill in manually.') }
    setExtracting(false)
  }

  const handleSubmit = async () => {
    if (!file || !amountIncl) { setError('Please attach a PDF and enter the total amount.'); return }
    setSubmitting(true); setError('')
    try {
      const ext      = file.name.split('.').pop()
      const fileName = `invoices/${supplierId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, file, { contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)

      const { data: inv, error: invError } = await supabase.from('invoices').insert({
        status:          'INGESTED',
        supplier_id:     supplierId,
        invoice_number:  invoiceNumber || null,
        invoice_date:    invoiceDate || null,
        due_date:        dueDate || null,
        amount_excl:     parseFloat(amountExcl) || null,
        amount_vat:      parseFloat(amountVat)  || null,
        amount_incl:     parseFloat(amountIncl),
        notes:           notes || null,
        storage_path:    fileName,
        currency:        'ZAR',
        submitted_by:    userEmail,
        record_type:     'INVOICE',
      }).select('id').single()

      if (invError) throw new Error(invError.message)

      await supabase.from('audit_trail').insert({
        invoice_id:  inv.id,
        from_status: null,
        to_status:   'INGESTED',
        actor_email: userEmail,
        notes:       'Submitted via supplier portal',
      })

      // Trigger extraction
      await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id }) })

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      {/* File upload */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Invoice PDF *</label>
        <div onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${file ? OLIVE : BORDER}`, borderRadius: '10px', padding: '24px', textAlign: 'center', cursor: 'pointer', backgroundColor: file ? '#F0FDF4' : LIGHT, position: 'relative' }}>
          {preview ? (
            <img src={preview} alt="invoice" style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain' }} />
          ) : file ? (
            <div>
              <div style={{ fontSize: '32px', marginBottom: '6px' }}>📄</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{file.name}</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>{(file.size / 1024).toFixed(0)} KB</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📎</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '4px' }}>Click to attach invoice PDF</div>
              <div style={{ fontSize: '12px', color: MUTED }}>PDF, JPG or PNG accepted</div>
            </>
          )}
          {extracting && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>🤖</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>Reading invoice...</div>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        {file && !extracting && (
          <button onClick={() => fileRef.current?.click()} style={{ marginTop: '6px', background: 'none', border: 'none', color: AMBER, fontSize: '12px', cursor: 'pointer' }}>Change file</button>
        )}
      </div>

      {extracted && (
        <div style={{ backgroundColor: '#F0FDF4', border: `1px solid #BBF7D0`, borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: OLIVE, fontWeight: '600' }}>
          ✓ Invoice data extracted — please review and confirm below
        </div>
      )}

      {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: RED }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Invoice Number</label>
          <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-001" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Excl. VAT</label>
            <input type="number" value={amountExcl} onChange={e => setAmountExcl(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>VAT</label>
            <input type="number" value={amountVat} onChange={e => setAmountVat(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Total *</label>
            <input type="number" value={amountIncl} onChange={e => setAmountIncl(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional information..." style={inputStyle} />
        </div>

        <button onClick={handleSubmit} disabled={submitting || !file || !amountIncl}
          style={{ padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: submitting || !file || !amountIncl ? '#C8B89A' : AMBER, color: WHITE, fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginTop: '4px' }}>
          {submitting ? 'Submitting...' : 'Submit Invoice →'}
        </button>
      </div>
    </div>
  )
})

export default function SupplierSubmit() {
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [userEmail, setUserEmail]   = useState('')
  const [success, setSuccess]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUserEmail(data.user.email ?? '')
      const { data: profile } = await supabase.from('user_profiles').select('supplier_id, role').eq('email', data.user.email).maybeSingle()
      if (profile?.role !== 'SUPPLIER' || !profile.supplier_id) { router.push('/'); return }
      setSupplierId(profile.supplier_id)
      setLoading(false)
    })
  }, [])

  if (loading) return <SupplierLayout><div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div></SupplierLayout>

  if (success) return (
    <SupplierLayout>
      <div style={{ maxWidth: '480px', margin: '60px auto', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', backgroundColor: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px' }}>✓</div>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: DARK, marginBottom: '8px' }}>Invoice Submitted</h2>
        <p style={{ fontSize: '14px', color: MUTED, marginBottom: '28px', lineHeight: 1.6 }}>
          Your invoice has been received and is being processed. You can track its status on the Invoices page.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={() => setSuccess(false)} style={{ padding: '11px 20px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Submit Another</button>
          <button onClick={() => router.push('/supplier/invoices')} style={{ padding: '11px 20px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>View Invoices</button>
        </div>
      </div>
    </SupplierLayout>
  )

  return (
    <SupplierLayout>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Submit Invoice</h1>
        <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Attach your invoice PDF and confirm the details below</p>
      </div>
      {supplierId && <SubmitForm supplierId={supplierId} userEmail={userEmail} onSuccess={() => setSuccess(true)} />}
    </SupplierLayout>
  )
}
