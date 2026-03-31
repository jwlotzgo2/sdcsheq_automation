'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const AMBER = '#E8960C'
const DARK  = '#2A2A2A'

export default function ResetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [mounted, setMounted]     = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    setMounted(true)
    // Handle Supabase password reset token from URL hash or query params
    const handleToken = async () => {
      // Check for hash fragment (#access_token=...&type=recovery)
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken  = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type         = params.get('type')
        if (accessToken && refreshToken && type === 'recovery') {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (error) setError('Invalid or expired reset link. Please request a new one.')
        }
      }
      // Check for ?code= query param (newer Supabase PKCE flow)
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) setError('Invalid or expired reset link. Please request a new one.')
      }
    }
    handleToken()
  }, [])

  const handleReset = async () => {
    if (!password || password !== confirm) {
      setError(password !== confirm ? 'Passwords do not match.' : 'Please enter a password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else { setDone(true); setLoading(false) }
  }

  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: DARK }} />

  return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: '24px' }}>
      <div style={{ backgroundColor: '#F5F5F2', borderRadius: '16px', padding: '36px 40px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>

        <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '3px 10px', marginBottom: '20px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.08em' }}>GoAutomate</span>
        </div>

        {!done ? (
          <>
            <h2 style={{ color: DARK, fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px' }}>Set new password</h2>
            <p style={{ color: '#8A8878', fontSize: '14px', margin: '0 0 24px' }}>Choose a strong password for your account.</p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>New password</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                style={{ width: '100%', padding: '12px 14px', fontSize: '16px', border: '1.5px solid #D8D5CC', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: '#fff' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Confirm password</label>
              <input
                type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                placeholder="Repeat password"
                autoComplete="new-password"
                style={{ width: '100%', padding: '12px 14px', fontSize: '16px', border: '1.5px solid #D8D5CC', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: '#fff' }}
              />
            </div>

            {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '13px', color: '#C0392B' }}>{error}</div>}

            <button onClick={handleReset} disabled={loading || !password || !confirm} style={{ width: '100%', padding: '13px', backgroundColor: loading || !password || !confirm ? '#C8B89A' : AMBER, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
            <h3 style={{ color: DARK, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Password updated</h3>
            <p style={{ color: '#8A8878', fontSize: '14px', marginBottom: '24px' }}>Your password has been changed successfully.</p>
            <a href="/" style={{ display: 'inline-block', padding: '12px 28px', backgroundColor: AMBER, color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: '700', textDecoration: 'none' }}>
              Sign in
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
