'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const NAV = [
  { href: '/supplier',          label: 'Dashboard', icon: '🏠' },
  { href: '/supplier/invoices', label: 'Invoices',  icon: '📄' },
  { href: '/supplier/submit',   label: 'Submit',    icon: '📤' },
  { href: '/supplier/profile',  label: 'Profile',   icon: '👤' },
]

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname()
  const router      = useRouter()
  const isMobile    = useIsMobile()
  const [supplierName, setSupplierName] = useState('')
  const [signingOut, setSigningOut]     = useState(false)
  const [isAdmin, setIsAdmin]           = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, supplier_id, suppliers(name)')
        .eq('email', data.user.email)
        .maybeSingle()
      if (!['SUPPLIER','AP_ADMIN'].includes(profile?.role ?? '')) { router.push('/'); return }
      setSupplierName((profile?.suppliers as any)?.name ?? data.user.email ?? '')
    })
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => href === '/supplier' ? pathname === '/supplier' : pathname.startsWith(href)

  if (isMobile) return (
    <div style={{ minHeight: '100vh', backgroundColor: LIGHT, fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{ backgroundColor: DARK, padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ backgroundColor: AMBER, borderRadius: '4px', padding: '3px 10px' }}>
            <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '12px' }}>Supplier Portal</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{supplierName}</span>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, padding: '16px', paddingBottom: '80px', overflowY: 'auto' }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '60px', backgroundColor: WHITE, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', zIndex: 50 }}>
        {NAV.map(({ href, label, icon }) => {
          const active = isActive(href)
          return (
            <Link key={href} href={href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textDecoration: 'none', padding: '6px 0' }}>
              <span style={{ fontSize: '20px' }}>{icon}</span>
              <span style={{ fontSize: '9px', fontWeight: active ? '700' : '400', color: active ? AMBER : MUTED }}>{label}</span>
              {active && <div style={{ width: '20px', height: '2px', backgroundColor: AMBER, borderRadius: '1px' }} />}
            </Link>
          )
        })}
        <button onClick={handleSignOut} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
          <span style={{ fontSize: '18px' }}>⏻</span>
          <span style={{ fontSize: '9px', color: MUTED }}>{signingOut ? '...' : 'Sign out'}</span>
        </button>
      </nav>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Arial, sans-serif', backgroundColor: LIGHT }}>
      {/* Sidebar */}
      <aside style={{ width: '220px', backgroundColor: DARK, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'fixed', top: 0, bottom: 0, left: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ backgroundColor: AMBER, borderRadius: '4px', padding: '3px 10px', display: 'inline-block', marginBottom: '8px' }}>
            <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '12px' }}>Supplier Portal</span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplierName}</div>
        </div>
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ href, label, icon }) => {
            const active = isActive(href)
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', backgroundColor: active ? 'rgba(232,150,12,0.15)' : 'transparent', borderLeft: active ? `3px solid ${AMBER}` : '3px solid transparent', color: active ? AMBER : 'rgba(255,255,255,0.55)', fontSize: '14px', fontWeight: active ? '600' : '400' }}>
                <span style={{ fontSize: '16px' }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {isAdmin && (
            <button onClick={() => router.push('/')} style={{ width: '100%', padding: '9px', borderRadius: '7px', border: 'none', backgroundColor: 'rgba(255,255,255,0.08)', color: AMBER, fontSize: '13px', cursor: 'pointer', marginBottom: '8px', fontWeight: '600' }}>
              ⊞ Switch Portal
            </button>
          )}
          <button onClick={handleSignOut} style={{ width: '100%', padding: '9px', borderRadius: '7px', border: 'none', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer' }}>
            → {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, marginLeft: '220px', padding: '28px 24px' }}>
        {children}
      </main>
    </div>
  )
}
