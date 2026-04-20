// app/suppliers/[id]/statement-config/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import { ProposedStatementConfig, ExtractedStatementLine } from '@/lib/types/statement'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const WHITE  = '#FFFFFF'
const MUTED  = '#8A8878'
const BORDER = '#E2E0D8'
const OLIVE  = '#5B6B2D'
const RED    = '#DC2626'

type Step = 'upload' | 'analysing' | 'review' | 'saving' | 'done'

export default function StatementConfigPage() {
  const { id: supplierId } = useParams<{ id: string }>()
  const router = useRouter()

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState<string>('')
  const [config, setConfig] = useState<ProposedStatementConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    // Admin-only page guard
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.from('user_profiles').select('role').eq('email', user.email).maybeSingle()
        .then(({ data: profile }) => {
          if (!['AP_ADMIN', 'FINANCE_MANAGER', 'APPROVER'].includes(profile?.role ?? '')) { router.push('/'); return }
        })
    })

    supabase
      .from('suppliers')
      .select('name')
      .eq('id', supplierId)
      .single()
      .then(({ data }) => {
        if (data) setSupplierName(data.name)
      })
  }, [supplierId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.type === 'application/pdf') {
      setFile(f)
      setError(null)
    } else {
      setError('Please select a PDF file')
    }
  }

  const handleAnalyse = useCallback(async () => {
    if (!file) return
    setStep('analysing')
    setError(null)

    try {
      const path = `statements/config-samples/${supplierId}-${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(path, file, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      setStoragePath(path)

      // Get signed URL for PDF preview
      const { data: urlData } = await supabase.storage
        .from('invoices')
        .createSignedUrl(path, 3600)
      if (urlData?.signedUrl) setPdfUrl(urlData.signedUrl)

      const res = await fetch('/api/recon/config/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: path }),
      })

      if (!res.ok) {
        const { error: apiError } = await res.json()
        throw new Error(apiError || 'Analysis failed')
      }

      const { proposed } = await res.json()
      setConfig(proposed)
      setStep('review')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setStep('upload')
    }
  }, [file, supplierId, supabase])

  const handleSave = async () => {
    if (!config || !storagePath) return
    setStep('saving')
    setError(null)

    try {
      const res = await fetch('/api/recon/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          sample_storage_path: storagePath,
          config,
        }),
      })

      if (!res.ok) {
        const { error: apiError } = await res.json()
        throw new Error(apiError || 'Save failed')
      }

      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setStep('review')
    }
  }

  const updateConfigField = (field: keyof ProposedStatementConfig, value: string | null) => {
    setConfig(prev => prev ? { ...prev, [field]: value || null } : prev)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    fontSize: '13px',
    color: DARK,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  }

  const fmt = (val: number | null) =>
    val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

  return (
    <AppShell>
      <div style={{ maxWidth: step === 'review' ? '1400px' : '760px', margin: '0 auto', padding: '32px 24px', transition: 'max-width 0.2s' }}>

        <div style={{ marginBottom: '28px' }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: MUTED, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}
          >
            ← Back to Suppliers
          </button>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: DARK, margin: 0 }}>
            Statement Layout Config
          </h1>
          {supplierName && (
            <p style={{ color: MUTED, fontSize: '14px', marginTop: '4px' }}>
              {supplierName}
            </p>
          )}
        </div>

        {(step === 'upload' || step === 'analysing') && (
          <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '28px' }}>
            <p style={{ fontSize: '14px', color: MUTED, marginTop: 0, marginBottom: '20px' }}>
              Upload a sample statement from this supplier. Claude will analyse the layout and propose a config.
              You'll review and edit the config before saving.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Sample Statement PDF</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                disabled={step === 'analysing'}
                style={{ ...inputStyle, padding: '6px' }}
              />
              {file && (
                <p style={{ fontSize: '12px', color: OLIVE, marginTop: '6px' }}>
                  Selected: {file.name}
                </p>
              )}
            </div>

            {error && (
              <p style={{ color: RED, fontSize: '13px', marginBottom: '16px' }}>{error}</p>
            )}

            <button
              onClick={handleAnalyse}
              disabled={!file || step === 'analysing'}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: !file || step === 'analysing' ? '#C8B89A' : AMBER,
                color: WHITE,
                fontSize: '14px',
                fontWeight: '700',
                cursor: !file || step === 'analysing' ? 'default' : 'pointer',
              }}
            >
              {step === 'analysing' ? 'Analysing layout...' : 'Analyse Statement'}
            </button>

            {step === 'analysing' && (
              <p style={{ fontSize: '12px', color: MUTED, marginTop: '12px' }}>
                Claude is reading the statement structure. This takes 10-20 seconds.
              </p>
            )}
          </div>
        )}

        {step === 'review' && config && (
          <div style={{ display: 'grid', gridTemplateColumns: pdfUrl ? '1fr 520px' : '1fr', gap: '24px' }}>
          {/* Left: config form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 16px' }}>
                Layout Summary
              </h2>
              <label style={labelStyle}>Claude's description of this statement</label>
              <textarea
                value={config.layout_notes || ''}
                onChange={e => updateConfigField('layout_notes', e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 16px' }}>
                Format & Column Labels
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Date Format</label>
                  <select
                    value={config.date_format}
                    onChange={e => updateConfigField('date_format', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="D MMM YYYY">D MMM YYYY</option>
                    <option value="DD MMM YYYY">DD MMM YYYY</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Reference Column Heading</label>
                  <input
                    value={config.reference_column_hint || ''}
                    onChange={e => updateConfigField('reference_column_hint', e.target.value)}
                    placeholder="e.g. Reference, Invoice No"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Reference Pattern (regex)</label>
                  <input
                    value={config.reference_pattern || ''}
                    onChange={e => updateConfigField('reference_pattern', e.target.value)}
                    placeholder="e.g. INV-[0-9]+"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Debit Column Heading</label>
                  <input
                    value={config.debit_label || ''}
                    onChange={e => updateConfigField('debit_label', e.target.value)}
                    placeholder="e.g. Debit, Charges"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Credit Column Heading</label>
                  <input
                    value={config.credit_label || ''}
                    onChange={e => updateConfigField('credit_label', e.target.value)}
                    placeholder="e.g. Credit, Payments"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Payment Row Identifier</label>
                  <input
                    value={config.payment_identifier || ''}
                    onChange={e => updateConfigField('payment_identifier', e.target.value)}
                    placeholder="e.g. Payment received - thank you"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Opening Balance Label</label>
                  <input
                    value={config.opening_balance_label || ''}
                    onChange={e => updateConfigField('opening_balance_label', e.target.value)}
                    placeholder="e.g. Opening Balance"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Closing Balance Label</label>
                  <input
                    value={config.closing_balance_label || ''}
                    onChange={e => updateConfigField('closing_balance_label', e.target.value)}
                    placeholder="e.g. Amount Due, Closing Balance"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {config.sample_lines && config.sample_lines.length > 0 && (
              <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '24px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 4px' }}>
                  Sample Lines Preview
                </h2>
                <p style={{ fontSize: '12px', color: MUTED, marginTop: 0, marginBottom: '16px' }}>
                  First 5 lines Claude extracted. Verify these look correct before saving.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                        {['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance', 'Type'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: MUTED, fontWeight: '600', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {config.sample_lines.map((line: ExtractedStatementLine, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{line.line_date || '—'}</td>
                          <td style={{ padding: '6px 8px' }}>{line.reference || '—'}</td>
                          <td style={{ padding: '6px 8px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description || '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(line.debit_amount)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(line.credit_amount)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(line.running_balance)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '700',
                              backgroundColor:
                                line.line_type === 'INVOICE' ? '#FEF3C7'
                                : line.line_type === 'PAYMENT' ? '#D1FAE5'
                                : line.line_type === 'CREDIT_NOTE' ? '#DBEAFE'
                                : '#F3F4F6',
                              color:
                                line.line_type === 'INVOICE' ? '#92400E'
                                : line.line_type === 'PAYMENT' ? '#065F46'
                                : line.line_type === 'CREDIT_NOTE' ? '#1E40AF'
                                : MUTED,
                            }}>
                              {line.line_type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <p style={{ color: RED, fontSize: '13px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSave}
                style={{
                  padding: '12px 28px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: AMBER,
                  color: WHITE,
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Save Config
              </button>
              <button
                onClick={() => { setStep('upload'); setConfig(null); setFile(null) }}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  backgroundColor: WHITE,
                  color: MUTED,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Start Over
              </button>
            </div>
          </div>

          {/* Right: PDF viewer */}
          {pdfUrl && (
            <div style={{
              backgroundColor: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: '10px',
              overflow: 'hidden',
              position: 'sticky',
              top: '20px',
              height: 'fit-content',
              maxHeight: 'calc(100vh - 140px)',
            }}>
              <iframe
                src={pdfUrl}
                style={{ width: '100%', height: 'calc(100vh - 160px)', border: 'none' }}
                title="Statement PDF"
              />
            </div>
          )}
          </div>
        )}

        {step === 'saving' && (
          <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '28px', textAlign: 'center' }}>
            <p style={{ color: MUTED, fontSize: '14px' }}>Saving config...</p>
          </div>
        )}

        {step === 'done' && (
          <div style={{ backgroundColor: '#F0FDF4', border: `1px solid #BBF7D0`, borderRadius: '10px', padding: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: '16px', fontWeight: '700', color: DARK, marginBottom: '8px' }}>Config saved</p>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '24px' }}>
              Claude will now use this layout every time a statement from {supplierName} is processed.
            </p>
            <button
              onClick={() => router.push('/suppliers')}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: AMBER,
                color: WHITE,
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Back to Suppliers
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
