'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const WHITE  = '#FFFFFF'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'

const PRIMARY_NAV = [
  { href: '/dashboard',  label: 'Dashboard',     icon: '▦' },
  { href: '/review',     label: 'Review',         icon: '📋' },
  { href: '/approve',    label: 'Approve',        icon: '✅' },
  { href: '/invoices',   label: 'Invoices',       icon: '🗒' },
]

const MORE_NAV = [
  { href: '/duplicates',      label: 'Duplicates',     icon: '⚠️' },
  { href: '/onboarding',      label: 'KYC',             icon: '👤' },
  { href: '/suppliers',       label: 'Suppliers',      icon: '🏢' },
  { href: '/gl-codes',        label: 'GL Codes',       icon: '📒' },
  { href: '/capture',         label: 'Capture',        icon: '📷' },
  { href: '/admin/users',     label: 'Users',          icon: '👥' },
  { href: '/admin/settings',  label: 'Settings',       icon: '⚙️' },
]

function useWindowWidth() {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return width
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname()
  const width       = useWindowWidth()
  const isMobile    = width > 0 && width < 768
  const [signingOut, setSigningOut]           = useState(false)
  const [reviewCount, setReviewCount]         = useState(0)
  const [approveCount, setApproveCount]       = useState(0)
  const [duplicateCount, setDuplicateCount]   = useState(0)
  const [drawerOpen, setDrawerOpen]           = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchCounts = async () => {
    const [{ count: rc }, { count: ac }, { count: dc }] = await Promise.all([
      supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED']),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
      supabase.from('duplicate_log').select('*', { count: 'exact', head: true }).eq('reviewed', false),
    ])
    setReviewCount(rc ?? 0)
    setApproveCount(ac ?? 0)
    setDuplicateCount(dc ?? 0)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const Badge = ({ count }: { count: number }) => count > 0 ? (
    <span style={{
      position: 'absolute', top: '2px', right: '16px',
      backgroundColor: '#EF4444', color: WHITE,
      fontSize: '9px', fontWeight: '700', borderRadius: '8px',
      padding: '1px 5px', minWidth: '14px', textAlign: 'center',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  ) : null

  const getBadge = (href: string) => {
    if (href === '/review')     return reviewCount
    if (href === '/approve')    return approveCount
    if (href === '/duplicates') return duplicateCount
    return 0
  }

  // ── DESKTOP sidebar ────────────────────────────────────────────
  if (!isMobile) {
    const NavItem = ({ href, label, icon, badge }: { href: string; label: string; icon: string; badge?: number }) => (
      <Link href={href} style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 16px', margin: '1px 8px', borderRadius: '6px',
          backgroundColor: isActive(href) ? AMBER : 'transparent',
          color: isActive(href) ? WHITE : 'rgba(255,255,255,0.55)',
          fontSize: '13px', fontWeight: isActive(href) ? '600' : '400',
          cursor: 'pointer', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{icon}</span>
            {label}
          </div>
          {badge != null && badge > 0 && (
            <span style={{ backgroundColor: isActive(href) ? 'rgba(255,255,255,0.3)' : AMBER, color: WHITE, fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 7px', minWidth: '18px', textAlign: 'center' }}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>
      </Link>
    )

    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
        <aside style={{ width: '220px', minHeight: '100vh', backgroundColor: DARK, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50 }}>
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '3px 8px', marginBottom: '8px' }}>
              <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.08em' }}>GoAutomate</span>
            </div>
            <div style={{ color: WHITE, fontWeight: 'bold', fontSize: '14px', lineHeight: 1.2 }}>SDC SHEQ</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', marginTop: '2px' }}>AP Automation</div>
          </div>
          <nav style={{ padding: '12px 0', flex: 1 }}>
            <div style={{ padding: '0 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Main</div>
            <NavItem href="/dashboard"  label="Dashboard"     icon="▦" />
            <NavItem href="/invoices"   label="Invoices"      icon="🗒" />
            <NavItem href="/review"     label="Review Queue"  icon="📋" badge={reviewCount} />
            <NavItem href="/approve"    label="Approve Queue" icon="✅" badge={approveCount} />
            <NavItem href="/duplicates" label="Duplicates"    icon="⚠️" badge={duplicateCount} />
            <NavItem href="/onboarding" label="KYC"           icon="👤" />
            <NavItem href="/suppliers"  label="Suppliers"     icon="🏢" />
            <NavItem href="/gl-codes"   label="GL Codes"      icon="📒" />
            <NavItem href="/capture"    label="Capture"       icon="📷" />
            <div style={{ padding: '12px 12px 6px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>Admin</div>
            <NavItem href="/admin/users"    label="Users"    icon="👥" />
            <NavItem href="/admin/settings" label="Settings" icon="⚙️" />
          </nav>
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={handleSignOut} disabled={signingOut} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.45)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>→</span>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.5 }}>Powered by Go 2 Analytics</div>
          </div>
        </aside>
        <div style={{ marginLeft: '220px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <header style={{ height: '56px', backgroundColor: WHITE, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 24px', position: 'sticky', top: 0, zIndex: 40 }}>
            <div style={{ flex: 1 }} />
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: AMBER, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '12px', fontWeight: '700' }}>JL</div>
          </header>
          <main style={{ flex: 1, padding: '28px 24px', backgroundColor: LIGHT }}>{children}</main>
        </div>
      </div>
    )
  }

  // ── MOBILE layout ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'Arial, sans-serif', backgroundColor: LIGHT }}>

      {/* Mobile top bar */}
      <header style={{ height: '52px', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ backgroundColor: AMBER, borderRadius: '3px', padding: '2px 8px' }}>
            <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '10px', letterSpacing: '0.08em' }}>GoAutomate</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>SDC SHEQ</span>
        </div>
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: AMBER, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '11px', fontWeight: '700' }}>JL</div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: '16px', paddingBottom: '80px', overflowY: 'auto' }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '60px', backgroundColor: WHITE, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', zIndex: 50 }}>
        {PRIMARY_NAV.map(({ href, label, icon }) => {
          const badge  = getBadge(href)
          const active = isActive(href)
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60px', position: 'relative', gap: '3px' }}>
                <span style={{ fontSize: '20px', lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: '10px', fontWeight: active ? '700' : '400', color: active ? AMBER : MUTED }}>{label}</span>
                {badge > 0 && <Badge count={badge} />}
                {active && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: '2px', backgroundColor: AMBER, borderRadius: '2px 2px 0 0' }} />}
              </div>
            </Link>
          )
        })}

        {/* More / hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60px', background: 'none', border: 'none', cursor: 'pointer', gap: '3px', position: 'relative' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[0,1,2].map(i => <div key={i} style={{ width: '18px', height: '2px', backgroundColor: MUTED, borderRadius: '1px' }} />)}
          </div>
          <span style={{ fontSize: '10px', color: MUTED }}>More</span>
          {duplicateCount > 0 && <Badge count={duplicateCount} />}
        </button>
      </nav>

      {/* Drawer overlay */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderRadius: '16px 16px 0 0', zIndex: 70, padding: '16px 0 32px' }}>
            {/* Handle */}
            <div style={{ width: '40px', height: '4px', backgroundColor: BORDER, borderRadius: '2px', margin: '0 auto 16px' }} />

            <div style={{ padding: '0 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {MORE_NAV.map(({ href, label, icon }) => {
                const badge  = getBadge(href)
                const active = isActive(href)
                return (
                  <Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => setDrawerOpen(false)}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 16px', borderRadius: '10px',
                      backgroundColor: active ? '#FEF3C7' : LIGHT,
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: '20px' }}>{icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: active ? '700' : '500', color: active ? AMBER : DARK }}>{label}</span>
                      {badge > 0 && (
                        <span style={{ marginLeft: 'auto', backgroundColor: '#EF4444', color: WHITE, fontSize: '10px', fontWeight: '700', borderRadius: '8px', padding: '1px 6px' }}>
                          {badge}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>

            <div style={{ margin: '12px 16px 0', paddingTop: '12px', borderTop: `1px solid ${BORDER}` }}>
              <button onClick={handleSignOut} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: LIGHT, color: MUTED, fontSize: '14px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                → {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
