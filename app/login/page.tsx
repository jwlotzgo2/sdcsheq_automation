'use client'

import { useState, useEffect, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const AMBER = '#E8960C'
const DARK  = '#2A2A2A'
const OLIVE = '#5B6B2D'

const STEPS = [
  { icon: '📧', label: 'Invoice Received',   color: '#3B82F6' },
  { icon: '🤖', label: 'AI Extraction',      color: '#8B5CF6' },
  { icon: '📋', label: 'Reviewer Checks',    color: AMBER },
  { icon: '✅', label: 'Approver Signs Off', color: OLIVE },
  { icon: '📤', label: 'Posted to Xero',     color: '#13B5EA' },
  { icon: '💰', label: 'Payment Tracked',    color: '#166534' },
]

// Completely isolated — owns its own state, never causes parent re-render
const DesktopSteps = memo(function DesktopSteps() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % STEPS.length), 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {STEPS.map((step, i) => {
        const isActive = active === i
        const isPast   = i < active
        const isFuture = i > active
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '130px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: isActive ? step.color : isPast ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', border: isActive ? `3px solid ${step.color}` : isPast ? '2px solid rgba(255,255,255,0.25)' : '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isActive ? '26px' : '22px', transition: 'all 0.5s', boxShadow: isActive ? `0 0 28px ${step.color}88` : 'none', marginBottom: '14px' }}>
                {isPast ? <span style={{ fontSize: '22px', color: 'rgba(255,255,255,0.6)' }}>✓</span> : step.icon}
              </div>
              <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#fff' : isFuture ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.3, transition: 'all 0.5s' }}>{step.label}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', width: '48px', marginBottom: '28px', flexShrink: 0 }}>
                <div style={{ height: '2px', width: '28px', backgroundColor: i < active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)', transition: 'background-color 0.5s' }} />
                <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `10px solid ${i < active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'}` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

// Completely standalone form — no props from animated parent
function SignInForm({ dark }: { dark?: boolean }) {
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [resetSent, setResetSent]   = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', fontSize: '16px',
    border: dark ? '1.5px solid rgba(255,255,255,0.15)' : '1.5px solid #D8D5CC',
    borderRadius: '8px', outline: 'none', boxSizing: 'border-box',
    color: dark ? '#fff' : DARK,
    backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#fff',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: dark ? 'rgba(255,255,255,0.7)' : DARK, marginBottom: '6px',
  }

  const headingStyle: React.CSSProperties = {
    color: dark ? '#fff' : DARK, fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px',
  }

  const subStyle: React.CSSProperties = {
    color: dark ? 'rgba(255,255,255,0.45)' : '#8A8878', fontSize: '14px', margin: '0 0 20px',
  }

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else window.location.href = '/dashboard'
  }

  const handleForgot = async () => {
    if (!email) { setError('Please enter your email address first.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setError(error.message); setLoading(false) }
    else { setResetSent(true); setLoading(false) }
  }

  if (!showForgot) return (
    <>
      <h2 style={headingStyle}>Sign in</h2>
      <p style={subStyle}>Enter your credentials to access GoAutomate</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Email address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="you@sdcsheq.co.za" autoComplete="email" style={inputStyle} />
      </div>
      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="••••••••" autoComplete="current-password" style={inputStyle} />
      </div>
      <div style={{ textAlign: 'right', marginBottom: '16px' }}>
        <button onClick={() => { setShowForgot(true); setError('') }}
          style={{ background: 'none', border: 'none', color: AMBER, fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          Forgot password?
        </button>
      </div>
      {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: '#C0392B' }}>{error}</div>}
      <button onClick={handleLogin} disabled={loading || !email || !password}
        style={{ width: '100%', padding: '13px', backgroundColor: loading || !email || !password ? (dark ? '#5A4A2A' : '#C8B89A') : AMBER, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </>
  )

  if (!resetSent) return (
    <>
      <button onClick={() => { setShowForgot(false); setError('') }}
        style={{ background: 'none', border: 'none', color: AMBER, fontSize: '13px', cursor: 'pointer', fontWeight: '600', padding: '0 0 14px', display: 'block' }}>
        ← Back to sign in
      </button>
      <h2 style={headingStyle}>Reset password</h2>
      <p style={subStyle}>Enter your email and we'll send you a reset link</p>
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Email address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleForgot()}
          placeholder="you@sdcsheq.co.za" autoComplete="email" style={inputStyle} />
      </div>
      {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: '#C0392B' }}>{error}</div>}
      <button onClick={handleForgot} disabled={loading || !email}
        style={{ width: '100%', padding: '13px', backgroundColor: loading || !email ? (dark ? '#5A4A2A' : '#C8B89A') : AMBER, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>
        {loading ? 'Sending...' : 'Send reset link'}
      </button>
    </>
  )

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ width: '56px', height: '56px', backgroundColor: dark ? 'rgba(255,255,255,0.1)' : '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
      <h3 style={{ color: dark ? '#fff' : DARK, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Check your email</h3>
      <p style={{ color: dark ? 'rgba(255,255,255,0.5)' : '#8A8878', fontSize: '14px', marginBottom: '24px' }}>
        Sent to <strong style={{ color: dark ? '#fff' : DARK }}>{email}</strong>
      </p>
      <button onClick={() => { setShowForgot(false); setResetSent(false) }}
        style={{ background: 'none', border: 'none', color: AMBER, fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
        Back to sign in
      </button>
    </div>
  )
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: DARK }} />

  if (isMobile) return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '4px 12px', marginBottom: '14px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.08em' }}>GoAutomate</span>
        </div>
        <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 'bold', margin: '0 0 8px', lineHeight: 1.2 }}>AP Automation<br />for SDC SHEQ</h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', margin: 0 }}>From invoice to Xero — automated, audited, compliant.</p>
      </div>
      <SignInForm dark />
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.18)', marginTop: '40px' }}>Powered by Go 2 Analytics · Microsoft Analytics Partner</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '4px 14px', marginBottom: '14px' }}>
            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.08em' }}>GoAutomate</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: '36px', fontWeight: 'bold', margin: '0 0 10px', lineHeight: 1.15 }}>AP Automation for SDC SHEQ</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px', margin: 0 }}>From invoice receipt to Xero — automated, audited, and always compliant.</p>
        </div>
        <DesktopSteps />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 64px 48px' }}>
        <div style={{ backgroundColor: '#F5F5F2', borderRadius: '16px', padding: '36px 40px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <SignInForm />
        </div>
      </div>
      <div style={{ textAlign: 'center', paddingBottom: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>Powered by Go 2 Analytics · Microsoft Analytics Partner</div>
    </div>
  )
}
