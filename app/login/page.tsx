'use client'

import { useState, useEffect, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const AMBER = '#E8960C'
const DARK  = '#2A2A2A'
const OLIVE = '#5B6B2D'

const STEPS = [
  { icon: '📧', label: 'Invoice Received',  color: '#3B82F6' },
  { icon: '🤖', label: 'AI Extraction',     color: '#8B5CF6' },
  { icon: '📋', label: 'Reviewer Checks',   color: AMBER },
  { icon: '✅', label: 'Approver Signs Off', color: OLIVE },
  { icon: '📤', label: 'Posted to Xero',    color: '#13B5EA' },
  { icon: '💰', label: 'Payment Tracked',   color: '#166534' },
]

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


const StepGrid = memo(({ isMobile }: { isMobile: boolean }) => {
  const [activeStep, setActiveStep] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % STEPS.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  if (isMobile) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '28px' }}>
        {STEPS.map((step, i) => {
          const isActive = activeStep === i
          const isPast   = i < activeStep
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              padding: '12px 8px', borderRadius: '10px',
              backgroundColor: isActive ? step.color : 'rgba(255,255,255,0.06)',
              border: isActive ? `2px solid ${step.color}` : '2px solid rgba(255,255,255,0.08)',
              boxShadow: isActive ? `0 0 16px ${step.color}55` : 'none',
              transition: 'all 0.4s',
            }}>
              <span style={{ fontSize: '22px' }}>{isPast ? '✓' : step.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: isActive ? '700' : '400', color: isActive ? '#fff' : 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.3 }}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {STEPS.map((step, i) => {
        const isActive = activeStep === i
        const isPast   = i < activeStep
        const isFuture = i > activeStep
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '130px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: isActive ? step.color : isPast ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', border: isActive ? `3px solid ${step.color}` : isPast ? '2px solid rgba(255,255,255,0.25)' : '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isActive ? '26px' : '22px', transition: 'all 0.5s ease', boxShadow: isActive ? `0 0 28px ${step.color}88` : 'none', marginBottom: '14px' }}>
                {isPast ? <span style={{ fontSize: '22px', color: 'rgba(255,255,255,0.6)' }}>✓</span> : step.icon}
              </div>
              <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#fff' : isFuture ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.3, transition: 'all 0.5s ease' }}>{step.label}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', width: '48px', marginBottom: '28px', flexShrink: 0 }}>
                <div style={{ height: '2px', width: '28px', backgroundColor: i < activeStep ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)', transition: 'background-color 0.5s' }} />
                <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `10px solid ${i < activeStep ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'}`, transition: 'border-color 0.5s' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
StepGrid.displayName = 'StepGrid'

export default function LoginPage() {
  const [email, setEmail]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [error, setError]           = useState('')
  const [exchanging, setExchanging] = useState(false)
  const [mounted, setMounted]       = useState(false)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    setExchanging(true)
    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) { setError('Sign-in link expired. Please request a new one.'); setExchanging(false) }
      else if (data?.session) window.location.href = '/dashboard'
    })
  }, [])

  const handleLogin = async () => {
    if (!email) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    if (error) { setError(error.message); setLoading(false) }
    else { setSent(true); setLoading(false) }
  }

  if (exchanging) return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>Signing you in...</p>
    </div>
  )

  const SignInForm = () => (
    !sent ? (
      <>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: DARK, fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px' }}>Sign in</h2>
          <p style={{ color: '#8A8878', fontSize: '14px', margin: 0 }}>Enter your email to receive a secure sign-in link</p>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Email address</label>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="you@sdcsheq.co.za"
            style={{ width: '100%', padding: '12px 14px', fontSize: '16px', border: '1.5px solid #D8D5CC', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: '#fff' }}
          />
        </div>
        {error && (
          <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: '#C0392B' }}>
            {error}
          </div>
        )}
        <button onClick={handleLogin} disabled={loading || !email} style={{
          width: '100%', padding: '13px', backgroundColor: loading || !email ? '#C8B89A' : AMBER,
          color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700',
          cursor: loading || !email ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Sending...' : 'Send magic link'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#8A8878', marginTop: '14px', marginBottom: 0 }}>
          No password required. We&apos;ll email you a secure link.
        </p>
      </>
    ) : (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ width: '56px', height: '56px', backgroundColor: '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
        <h3 style={{ color: DARK, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Check your email</h3>
        <p style={{ color: '#8A8878', fontSize: '14px', marginBottom: '24px' }}>
          We sent a sign-in link to <strong>{email}</strong>
        </p>
        <button onClick={() => { setSent(false); setEmail('') }} style={{ background: 'none', border: 'none', color: AMBER, fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
          Use a different email
        </button>
      </div>
    )
  )

  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: DARK }} />

  // ── MOBILE ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', padding: '36px 20px 32px', boxSizing: 'border-box' }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '4px 14px', marginBottom: '10px' }}>
            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.08em' }}>GoAutomate</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: 'bold', margin: '0 0 6px', lineHeight: 1.2 }}>AP Automation for SDC SHEQ</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>From invoice to Xero — automated and audited.</p>
        </div>

        <StepGrid isMobile={true} />

        {/* Sign in card */}
        <div style={{ backgroundColor: '#F5F5F2', borderRadius: '16px', padding: '24px 20px', boxSizing: 'border-box' }}>
          <SignInForm />
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>
          Powered by Go 2 Analytics · Microsoft Analytics Partner
        </div>
      </div>
    )
  }

  // ── DESKTOP ───────────────────────────────────────────────────
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
        <StepGrid isMobile={false} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 64px 48px' }}>
        <div style={{ backgroundColor: '#F5F5F2', borderRadius: '16px', padding: '36px 40px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <SignInForm />
        </div>
      </div>
      <div style={{ textAlign: 'center', paddingBottom: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>
        Powered by Go 2 Analytics · Microsoft Analytics Partner
      </div>
    </div>
  )
}
