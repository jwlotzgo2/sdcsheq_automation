'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'



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

function SettingsContent() {
  const isMobile = useIsMobile()
  const [xeroSettings, setXeroSettings] = useState<any>(null)
  const [loading, setLoading]           = useState(true)
  const [syncing, setSyncing]           = useState<string | null>(null)
  const [syncResult, setSyncResult]     = useState<string | null>(null)
  const searchParams = useSearchParams()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchSettings() }, [])

  useEffect(() => {
    const status = searchParams.get('xero')
    if (status === 'connected') setSyncResult('✓ Xero connected successfully')
    if (status === 'error')     setSyncResult('✗ Xero connection failed — please try again')
    if (status === 'no_tenant') setSyncResult('✗ No Xero organisation found — ensure you have access to at least one organisation')
  }, [searchParams])

  const fetchSettings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('xero_settings')
      .select('id, tenant_id, tenant_name, access_token, refresh_token, token_expires_at, last_sync_at')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle()
    setXeroSettings(data)
    setLoading(false)
  }

  const handleSync = async (type: 'gl' | 'suppliers' | 'both') => {
    setSyncing(type)
    setSyncResult(null)
    try {
      const res = await fetch('/api/xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSyncResult(`✓ ${data.message}`)
      fetchSettings()
    } catch (err: any) {
      setSyncResult(`✗ ${err.message}`)
    }
    setSyncing(null)
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Xero? This will not affect existing data but you will need to reconnect to push new invoices.')) return
    await supabase.from('xero_settings').delete().eq('id', '00000000-0000-0000-0000-000000000001')
    setXeroSettings(null)
    setSyncResult('Xero disconnected.')
  }

  const isConnected   = !!xeroSettings?.access_token
  const tokenExpiry   = xeroSettings?.token_expires_at ? new Date(xeroSettings.token_expires_at) : null
  const tokenExpired  = tokenExpiry ? tokenExpiry < new Date() : false

  return (
    <AppShell>
      <div style={{ maxWidth: '760px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Settings</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Integrations and configuration</p>
        </div>

        {/* Xero Integration */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: DARK, marginBottom: '2px' }}>Xero Integration</div>
              <div style={{ fontSize: '12px', color: MUTED }}>Sync GL codes and suppliers, push approved invoices</div>
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
              backgroundColor: isConnected && !tokenExpired ? '#DCFCE7' : '#FEE2E2',
              color: isConnected && !tokenExpired ? OLIVE : RED,
            }}>
              {loading ? '...' : isConnected && !tokenExpired ? '● Connected' : isConnected && tokenExpired ? '● Token Expired' : '○ Not Connected'}
            </div>
          </div>

          <div style={{ padding: '20px' }}>
            {syncResult && (
              <div style={{
                padding: '10px 14px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px',
                backgroundColor: syncResult.startsWith('✓') ? '#DCFCE7' : '#FEE2E2',
                color: syncResult.startsWith('✓') ? OLIVE : RED,
                border: `1px solid ${syncResult.startsWith('✓') ? '#BBF7D0' : '#FECACA'}`,
              }}>
                {syncResult}
              </div>
            )}

            {isConnected ? (
              <>
                {/* Connection details */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Organisation',    value: xeroSettings.tenant_name },
                    { label: 'Connected',        value: fmtDate(xeroSettings.connected_at) },
                    { label: 'Token expires',    value: fmtDate(xeroSettings.token_expires_at) },
                    { label: 'Last sync',        value: fmtDate(xeroSettings.last_sync_at) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ backgroundColor: LIGHT, borderRadius: '7px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: DARK }}>{value ?? '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Sync actions */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Sync from Xero</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                    <button
                      onClick={() => handleSync('gl')}
                      disabled={!!syncing}
                      style={{ padding: '9px 18px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      {syncing === 'gl' ? 'Syncing...' : '↓ Sync GL Codes'}
                    </button>
                    <button
                      onClick={() => handleSync('suppliers')}
                      disabled={!!syncing}
                      style={{ padding: '9px 18px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      {syncing === 'suppliers' ? 'Syncing...' : '↓ Sync Suppliers'}
                    </button>
                    <button
                      onClick={() => handleSync('both')}
                      disabled={!!syncing}
                      style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {syncing === 'both' ? 'Syncing...' : '↓ Sync All'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleDisconnect}
                  style={{ padding: '8px 16px', borderRadius: '7px', border: `1.5px solid ${RED}`, backgroundColor: WHITE, color: RED, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Disconnect Xero
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>
                  Connect your Xero account to sync GL codes and suppliers, and automatically push approved invoices as bills.
                </p>
                <a
                  href="/api/xero/connect"
                  style={{
                    display: 'inline-block', padding: '11px 28px', borderRadius: '8px',
                    backgroundColor: '#13B5EA', color: WHITE, fontSize: '14px', fontWeight: '700',
                    textDecoration: 'none',
                  }}
                >
                  Connect to Xero
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
