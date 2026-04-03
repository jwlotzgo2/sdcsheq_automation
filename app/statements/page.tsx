// app/statements/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const WHITE  = '#FFFFFF'
const MUTED  = '#8A8878'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const RED    = '#DC2626'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  INGESTED:    { bg: '#F3F4F6', text: '#374151' },
  EXTRACTING:  { bg: '#FEF3C7', text: '#92400E' },
  EXTRACTED:   { bg: '#DBEAFE', text: '#1E40AF' },
  RECONCILING: { bg: '#FEF3C7', text: '#92400E' },
  RECONCILED:  { bg: '#D1FAE5', text: '#065F46' },
  EXCEPTION:   { bg: '#FEE2E2', text: '#991B1B' },
  FAILED:      { bg: '#FEE2E2', text: '#991B1B' },
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Supplier {
  id: string
  name: string
  supplier_statement_configs?: { id: string; trained_at: string }[]
}

interface Statement {
  id: string
  supplier_id: string
  status: string
  statement_date: string | null
  date_from: string | null
  date_to: string | null
  closing_balance: number | null
  ingested_at: string
  suppliers: { name: string } | null
}

export default function StatementsPage() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const load = useCallback(async () => {
    const [{ data: stmts }, { data: sups }] = await Promise.all([
      supabase
        .from('supplier_statements')
        .select('id, supplier_id, status, statement_date, date_from, date_to, closing_balance, ingested_at, suppliers(name)')
        .order('ingested_at', { ascending: false })
        .limit(50),
      supabase
        .from('suppliers')
        .select('id, name, supplier_statement_configs(id, trained_at)')
        .eq('is_active', true)
        .order('name'),
    ])
    setStatements((stmts as Statement[]) || [])
    setSuppliers((sups as Supplier[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const handleUpload = async () => {
    if (!file || !selectedSupplier) return
    setUploading(true)
    setError(null)

    try {
      const path = `statements/${selectedSupplier}-${Date.now()}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('invoices')
        .upload(path, file, { contentType: 'application/pdf' })

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

      const res = await fetch('/api/statements/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: selectedSupplier, storage_path: path }),
      })

      if (!res.ok) {
        const { error: apiErr } = await res.json()
        throw new Error(apiErr || 'Ingest failed')
      }

      setFile(null)
      setSelectedSupplier('')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (statementId: string) => {
    if (!confirm('Delete this statement and all its reconciliation data?')) return
    try {
      const res = await fetch(`/api/statements/${statementId}/delete`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      await load()
    } catch {
      setError('Failed to delete statement')
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    fontSize: '13px',
    color: DARK,
    outline: 'none',
  }

  return (
    <AppShell>
      <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: DARK, margin: 0 }}>
            Supplier Reconciliation
          </h1>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedSupplier}
              onChange={e => setSelectedSupplier(e.target.value)}
              style={{ ...inputStyle, minWidth: '180px' }}
              disabled={uploading}
            >
              <option value="">Select supplier...</option>
              {suppliers.map(s => {
                const hasConfig = (s.supplier_statement_configs?.length ?? 0) > 0
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{hasConfig ? ' ✓' : ' (no config)'}
                  </option>
                )
              })}
            </select>

            <input
              type="file"
              accept="application/pdf"
              onChange={e => setFile(e.target.files?.[0] || null)}
              disabled={uploading}
              style={{ ...inputStyle, fontSize: '12px' }}
            />

            <button
              onClick={handleUpload}
              disabled={!file || !selectedSupplier || uploading}
              style={{
                padding: '9px 18px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: !file || !selectedSupplier || uploading ? '#C8B89A' : AMBER,
                color: WHITE,
                fontSize: '13px',
                fontWeight: '700',
                cursor: !file || !selectedSupplier || uploading ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Statement'}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: RED, fontSize: '13px', marginBottom: '16px' }}>{error}</p>
        )}

        <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}`, backgroundColor: LIGHT }}>
                {['Supplier', 'Statement Date', 'Period', 'Closing Balance', 'Status', 'Uploaded', '', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', color: MUTED, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: MUTED }}>Loading...</td></tr>
              ) : statements.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: MUTED }}>No statements yet. Upload one above.</td></tr>
              ) : statements.map(s => {
                const colors = STATUS_COLORS[s.status] || STATUS_COLORS.INGESTED
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '10px 14px', fontWeight: '600', color: DARK }}>{s.suppliers?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: MUTED }}>{fmtDate(s.statement_date)}</td>
                    <td style={{ padding: '10px 14px', color: MUTED, whiteSpace: 'nowrap' }}>
                      {s.date_from && s.date_to ? `${fmtDate(s.date_from)} - ${fmtDate(s.date_to)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: DARK, textAlign: 'right' }}>
                      {fmt(s.closing_balance)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: '4px',
                        fontSize: '11px', fontWeight: '700',
                        backgroundColor: colors.bg, color: colors.text,
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: MUTED, whiteSpace: 'nowrap' }}>
                      {fmtDate(s.ingested_at)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {(s.status === 'EXTRACTED' || s.status === 'RECONCILED' || s.status === 'EXCEPTION') && (
                        <Link
                          href={`/statements/${s.id}`}
                          style={{ fontSize: '12px', color: AMBER, fontWeight: '600', textDecoration: 'none' }}
                        >
                          {s.status === 'EXTRACTED' ? 'Reconcile' : s.status === 'EXCEPTION' ? 'Review' : 'View'}
                        </Link>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <button
                        onClick={() => handleDelete(s.id)}
                        style={{
                          background: 'none', border: 'none', color: '#9CA3AF',
                          fontSize: '14px', cursor: 'pointer', padding: '2px 6px',
                        }}
                        title="Delete statement"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
