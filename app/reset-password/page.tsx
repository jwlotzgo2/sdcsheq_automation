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
  const [sessionReady, setSessionReady] = useState(false)
  const [expired, setExpired]     = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendSent, setResendSent]   = useState(false)
  const [checking, setChecking]   = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    setMounted(true)
    const handleToken = async () => {
      // First check if we already have a valid session (set by /api/auth/callback)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setSessionReady(true)
        setChecking(false)
        return
      }

      // Check for hash fragment (#access_token=...&type=recovery|invite|signup|magiclink)
      // All of these legitimately land here to let the user set/reset a password.
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken  = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type         = params.get('type')
        const acceptable   = new Set(['recovery', 'invite', 'signup', 'magiclink'])
        if (accessToken && refreshToken && (!type || acceptable.has(type))) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (error) {
            setExpired(true)
          } else {
            setSessionReady(true)
          }
          setChecking(false)
          return
        }
      }

      // Check for ?code= query param (PKCE flow)
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setExpired(true)
        } else {
          setSessionReady(true)
        }
        setChecking(false)
        return
      }

      // No token, no code, no session — link was probably expired or invalid
      setExpired(true)
      setChecking(false)
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

  const handleResend = async () => {
    if (!resendEmail) { setError('Please enter your email address.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    })
    if (error) { setError(error.message); setLoading(false) }
    else { setResendSent(true); setLoading(false) }
  }

  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: DARK }} />

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', fontSize: '16px',
    border: '1.5px solid #D8D5CC', borderRadius: '8px', outline: 'none',
    boxSizing: 'border-box', color: DARK, backgroundColor: '#fff',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: '24px' }}>
      <div style={{ backgroundColor: '#F5F5F2', borderRadius: '16px', padding: '36px 40px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>

        <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '3px 10px', marginBottom: '20px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.08em' }}>GoAutomate</span>
        </div>

        {checking ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: '#8A8878', fontSize: '15px' }}>Verifying reset link...</p>
          </div>
        ) : expired && !resendSent ? (
          <>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#FEE2E2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>⏱</div>
            <h2 style={{ color: DARK, fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px', textAlign: 'center' }}>Reset link expired</h2>
            <p style={{ color: '#8A8878', fontSize: '14px', margin: '0 0 24px', textAlign: 'center' }}>The link took too long to arrive or has already been used. Enter your email to get a new one.</p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Email address</label>
              <input
                type="email" value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleResend()}
                placeholder="you@sdcsheq.co.za" autoComplete="email"
                style={inputStyle}
              />
            </div>

            {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: '#C0392B' }}>{error}</div>}

            <button onClick={handleResend} disabled={loading || !resendEmail}
              style={{ width: '100%', padding: '13px', backgroundColor: loading || !resendEmail ? '#C8B89A' : AMBER, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginBottom: '12px' }}>
              {loading ? 'Sending...' : 'Send new reset link'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <a href="/login" style={{ color: AMBER, fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>Back to sign in</a>
            </div>
          </>
        ) : resendSent ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
            <h3 style={{ color: DARK, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Check your email</h3>
            <p style={{ color: '#8A8878', fontSize: '14px', marginBottom: '24px' }}>
              A new reset link has been sent to <strong style={{ color: DARK }}>{resendEmail}</strong>
            </p>
            <a href="/login" style={{ color: AMBER, fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>Back to sign in</a>
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
            <h3 style={{ color: DARK, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Password updated</h3>
            <p style={{ color: '#8A8878', fontSize: '14px', marginBottom: '24px' }}>Your password has been changed successfully.</p>
            <a href="/" style={{ display: 'inline-block', padding: '12px 28px', backgroundColor: AMBER, color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: '700', textDecoration: 'none' }}>
              Sign in
            </a>
          </div>
        ) : sessionReady ? (
          <>
            <h2 style={{ color: DARK, fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px' }}>Set new password</h2>
            <p style={{ color: '#8A8878', fontSize: '14px', margin: '0 0 24px' }}>Choose a strong password for your account.</p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters" autoComplete="new-password" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                placeholder="Repeat password" autoComplete="new-password" style={inputStyle} />
            </div>

            {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '13px', color: '#C0392B' }}>{error}</div>}

            <button onClick={handleReset} disabled={loading || !password || !confirm} style={{ width: '100%', padding: '13px', backgroundColor: loading || !password || !confirm ? '#C8B89A' : AMBER, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
