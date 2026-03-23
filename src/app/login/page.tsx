'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0F2044',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo / Brand */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            backgroundColor: '#0F2044',
            borderRadius: '8px',
            padding: '8px 16px',
            marginBottom: '16px',
          }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '14px', letterSpacing: '0.05em' }}>
              GO 2 ANALYTICS
            </span>
          </div>
          <h1 style={{ color: '#0F2044', fontSize: '22px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            AP Automation
          </h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: 0 }}>
            Sign in to your account
          </p>
        </div>

        {!sent ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: '#334155',
                marginBottom: '6px',
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="you@company.co.za"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '15px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#0F172A',
                  backgroundColor: '#F8FAFC',
                }}
              />
            </div>

            {error && (
              <div style={{
                backgroundColor: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#C0392B',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !email}
              style={{
                width: '100%',
                padding: '11px',
                backgroundColor: loading || !email ? '#94A3B8' : '#1B6EC2',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading || !email ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '12px', color: '#94A3B8', marginTop: '20px', marginBottom: 0 }}>
              We&apos;ll send a secure sign-in link to your email. No password required.
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              backgroundColor: '#DCFCE7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '24px',
            }}>
              ✓
            </div>
            <h2 style={{ color: '#0F2044', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
              Check your email
            </h2>
            <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '24px' }}>
              We sent a sign-in link to <strong>{email}</strong>. Click the link to access your account.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                background: 'none',
                border: 'none',
                color: '#1B6EC2',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
