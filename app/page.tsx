'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const TEAL   = '#13B5EA'
const PURPLE = '#8B5CF6'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

const PORTALS = [
  {
    id: 'user',
    icon: '📋',
    title: 'User App',
    description: 'Review and approve invoices, manage the AP pipeline, push to Xero, and capture expenses.',
    href: '/dashboard',
    color: AMBER,
    bg: '#FEF3C7',
    roles: ['AP_CLERK', 'APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN'],
  },
  {
    id: 'supplier',
    icon: '🏢',
    title: 'Supplier Portal',
    description: 'Submit invoices, track payment status, and manage your company profile.',
    href: '/supplier',
    color: TEAL,
    bg: '#EBF9FF',
    roles: ['SUPPLIER', 'AP_ADMIN'],
  },
  {
    id: 'admin',
    icon: '⚙️',
    title: 'Admin Portal',
    description: 'Manage users, settings, Xero connection, cost centres, and system configuration.',
    href: '/admin',
    color: PURPLE,
    bg: '#F5F3FF',
    roles: ['AP_ADMIN', 'FINANCE_MANAGER'],
  },
]

export default function HomePage() {
  const [role, setRole]         = useState('')
  const [userName, setUserName] = useState('')
  const [loading, setLoading]   = useState(true)
  const [mounted, setMounted]   = useState(false)
  const router   = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, full_name, can_capture_expenses')
        .eq('email', user.email)
        .maybeSingle()
      const r = profile?.role ?? ''
      setRole(r)
      setUserName(profile?.full_name ?? user.email?.split('@')[0] ?? '')

      // Single portal users go straight there
      if (r === 'SUPPLIER') { router.push('/supplier'); return }
      if (r === 'AP_CLERK' || r === 'APPROVER') { router.push('/dashboard'); return }

      setLoading(false)
    }
    load()
  }, [mounted])

  const availablePortals = PORTALS.filter(p => p.roles.includes(role))

  // If only one portal, redirect immediately (handled above for known single-portal roles)
  // For unknown/null roles, show all
  const portals = availablePortals.length > 0 ? availablePortals : PORTALS

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (!mounted || loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '4px 14px', marginBottom: '16px' }}>
          <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.08em' }}>GoAutomate</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK, display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <header style={{ padding: isMobile ? '20px 24px 0' : '32px 64px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '4px 14px' }}>
          <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.08em' }}>GoAutomate</span>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '13px', cursor: 'pointer' }}>
          Sign out
        </button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: isMobile ? '32px 24px 40px' : '48px 64px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: isMobile ? '32px' : '48px', textAlign: 'center' }}>
          <h1 style={{ color: WHITE, fontSize: isMobile ? '24px' : '32px', fontWeight: 'bold', margin: '0 0 8px', lineHeight: 1.2 }}>
            {greeting()}{userName ? `, ${userName}` : ''} 👋
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', margin: 0 }}>
            SDC SHEQ · AP Automation Platform
          </p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', margin: '6px 0 0' }}>
            Select a portal to continue
          </p>
        </div>

        {/* Portal cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : portals.length === 1 ? '400px' : portals.length === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: '16px',
          maxWidth: portals.length === 1 ? '400px' : portals.length === 2 ? '720px' : '960px',
          margin: '0 auto',
          width: '100%',
        }}>
          {portals.map(portal => (
            <div key={portal.id}
              onClick={() => router.push(portal.href)}
              style={{
                backgroundColor: WHITE,
                borderRadius: '16px',
                padding: isMobile ? '24px' : '32px',
                cursor: 'pointer',
                border: `2px solid transparent`,
                transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.3)`
                e.currentTarget.style.borderColor = portal.color
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.borderColor = 'transparent'
              }}
            >
              {/* Icon */}
              <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: portal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', marginBottom: '16px' }}>
                {portal.icon}
              </div>

              {/* Title */}
              <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: DARK, marginBottom: '8px' }}>
                {portal.title}
              </div>

              {/* Description */}
              <div style={{ fontSize: '13px', color: MUTED, lineHeight: 1.6, marginBottom: '20px' }}>
                {portal.description}
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: portal.color, fontWeight: '700', fontSize: '13px' }}>
                Open {portal.title}
                <span style={{ fontSize: '16px' }}>→</span>
              </div>

              {/* Colour accent bottom bar */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: portal.color }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
        Powered by Go 2 Analytics · Microsoft Analytics Partner
      </div>
    </div>
  )
}
