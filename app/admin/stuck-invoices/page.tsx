'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'
const GREEN  = '#059669'

// Invoices sitting in INGESTED older than STALE_MINUTES are shown as "stuck"
// and are the primary targets for manual re-extraction.
const STALE_MINUTES: number = 2

const fmtDT = (val: string) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const ageMinutes = (val: string) => {
  if (!val) return 0
  return Math.floor((Date.now() - new Date(val).getTime()) / 60000)
}

interface StuckInvoice {
  id: string
  created_at: string
  supplier_name: string | null
  subject_hint: string | null // derived from notes
  storage_path: string | null
  postmark_message_id: string | null
  source: string | null
  extraction_retries: number | null
  extraction_started_at: string | null
}

export default function StuckInvoicesPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<StuckInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<Record<string, 'running' | 'ok' | string>>({})
  const [error, setError]     = useState('')

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )

  const load = useCallback(async () => {
    setLoading(true); setError('')

    // Gate client-side too — server /api/admin/reextract also enforces AP_ADMIN.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (!profile || profile.role !== 'AP_ADMIN') {
      setError('Admin access required.'); setLoading(false); return
    }

    const { data, error: qErr } = await supabase
      .from('invoices')
      .select('id, created_at, supplier_name, notes, storage_path, postmark_message_id, source, extraction_retries, extraction_started_at, status')
      .eq('status', 'INGESTED')
      .order('created_at', { ascending: false })
      .limit(200)

    if (qErr) { setError(qErr.message); setLoading(false); return }

    const mapped: StuckInvoice[] = (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      supplier_name: r.supplier_name,
      subject_hint: typeof r.notes === 'string' ? r.notes.replace(/^Subject:\s*/i, '').slice(0, 120) : null,
      storage_path: r.storage_path,
      postmark_message_id: r.postmark_message_id,
      source: r.source,
      extraction_retries: r.extraction_retries,
      extraction_started_at: r.extraction_started_at,
    }))
    setRows(mapped)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  const reextract = async (invoiceId: string) => {
    setWorking((w) => ({ ...w, [invoiceId]: 'running' }))
    try {
      const res = await fetch('/api/admin/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWorking((w) => ({ ...w, [invoiceId]: json.error ?? `HTTP ${res.status}` }))
        return
      }
      setWorking((w) => ({ ...w, [invoiceId]: 'ok' }))
      // Give the extractor a second to flip status, then refresh.
      setTimeout(() => load(), 1200)
    } catch (err: any) {
      setWorking((w) => ({ ...w, [invoiceId]: err?.message ?? 'failed' }))
    }
  }

  const stale = rows.filter((r) => ageMinutes(r.created_at) >= STALE_MINUTES)
  const recent = rows.filter((r) => ageMinutes(r.created_at) < STALE_MINUTES)

  return (
    <AppShell>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, color: DARK, fontSize: 22, fontWeight: 700 }}>Stuck invoices</h1>
            <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 13 }}>
              Invoices that were received but never completed extraction. Re-trigger to retry Claude OCR.
            </p>
          </div>
          <button
            onClick={load}
            style={{ padding: '8px 14px', backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6, color: DARK, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: MUTED, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
        ) : (
          <>
            <Section
              title={`Stuck — needs attention (${stale.length})`}
              subtitle={`INGESTED for longer than ${STALE_MINUTES} minute${STALE_MINUTES === 1 ? '' : 's'}`}
              rows={stale}
              working={working}
              onReextract={reextract}
              emptyLabel="Nothing stuck. "
              accent={RED}
            />

            <Section
              title={`Just arrived (${recent.length})`}
              subtitle="Extraction may still be in progress — give it a moment before re-triggering"
              rows={recent}
              working={working}
              onReextract={reextract}
              emptyLabel="No invoices arrived in the last couple of minutes."
              accent={AMBER}
            />
          </>
        )}
      </div>
    </AppShell>
  )
}

function Section({ title, subtitle, rows, working, onReextract, emptyLabel, accent }: {
  title: string
  subtitle: string
  rows: StuckInvoice[]
  working: Record<string, 'running' | 'ok' | string>
  onReextract: (id: string) => void
  emptyLabel: string
  accent: string
}) {
  return (
    <div style={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 24, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, borderLeft: `3px solid ${accent}` }}>
        <div style={{ color: DARK, fontSize: 15, fontWeight: 700 }}>{title}</div>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px 18px', color: MUTED, fontSize: 13 }}>{emptyLabel}</div>
      ) : (
        <div>
          {rows.map((r) => {
            const state = working[r.id]
            const age = ageMinutes(r.created_at)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14, padding: '12px 18px', borderTop: `1px solid ${LIGHT}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: DARK, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.subject_hint || r.supplier_name || '(no subject)'}
                  </div>
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>From: <strong style={{ color: DARK }}>{r.supplier_name ?? '—'}</strong></span>
                    <span>Received: {fmtDT(r.created_at)}</span>
                    <span>Age: {age}m</span>
                    {r.extraction_retries != null && r.extraction_retries > 0 && (
                      <span>Retries: {r.extraction_retries}</span>
                    )}
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id.slice(0, 8)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {state === 'running' && <span style={{ color: MUTED, fontSize: 12 }}>Running…</span>}
                  {state === 'ok' && <span style={{ color: GREEN, fontSize: 12, fontWeight: 600 }}>✓ Queued</span>}
                  {state && state !== 'running' && state !== 'ok' && <span style={{ color: RED, fontSize: 12 }}>{state}</span>}
                  <button
                    onClick={() => onReextract(r.id)}
                    disabled={state === 'running'}
                    style={{ padding: '8px 14px', backgroundColor: state === 'running' ? '#C8B89A' : AMBER, color: WHITE, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: state === 'running' ? 'not-allowed' : 'pointer' }}
                  >
                    Re-extract
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
