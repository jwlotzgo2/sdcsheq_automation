'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'
const BLUE   = '#3B82F6'
const PURPLE = '#8B5CF6'
const TEAL   = '#13B5EA'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

const fmt = (val: any) =>
  val != null ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'

export default function HomePage() {
  const [loading, setLoading]         = useState(true)
  const [userEmail, setUserEmail]     = useState('')
  const [userName, setUserName]       = useState('')
  const [role, setRole]               = useState('')
  const [stats, setStats]             = useState({
    pendingReview:    0,
    pendingApproval:  0,
    overdue:          0,
    approvedReady:    0,
    overdueValue:     0,
    totalPipeline:    0,
    xeroPosted:       0,
  })
  const router  = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, full_name')
        .eq('email', user.email)
        .maybeSingle()
      setRole(profile?.role ?? '')
      setUserName(profile?.full_name ?? user.email?.split('@')[0] ?? '')

      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, status, due_date, amount_incl')
        .not('status', 'in', '("REJECTED","XERO_PAID")')

      if (!invoices) { setLoading(false); return }

      const now = new Date()
      const pendingReview   = invoices.filter(i => ['PENDING_REVIEW','IN_REVIEW','RETURNED'].includes(i.status)).length
      const pendingApproval = invoices.filter(i => i.status === 'PENDING_APPROVAL').length
      const approvedReady   = invoices.filter(i => i.status === 'APPROVED').length
      const xeroPosted      = invoices.filter(i => i.status === 'XERO_POSTED').length
      const overdueInvs     = invoices.filter(i =>
        i.due_date && new Date(i.due_date) < now &&
        !['APPROVED','XERO_POSTED','XERO_AUTHORISED'].includes(i.status)
      )
      const overdue      = overdueInvs.length
      const overdueValue = overdueInvs.reduce((s, i) => s + (Number(i.amount_incl) || 0), 0)
      const totalPipeline = invoices.reduce((s, i) => s + (Number(i.amount_incl) || 0), 0)

      setStats({ pendingReview, pendingApproval, overdue, approvedReady, overdueValue, totalPipeline, xeroPosted })
      setLoading(false)
    }
    load()
  }, [])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  type Card = {
    icon: string
    title: string
    description: string
    href: string
    count?: number
    countLabel?: string
    value?: string
    color: string
    bg: string
    urgent?: boolean
    show?: boolean
  }

  const cards: Card[] = [
    // Overdue — always show if any, very urgent
    {
      icon: '🚨',
      title: 'Overdue Invoices',
      description: `${stats.overdue} invoice${stats.overdue !== 1 ? 's' : ''} past due date — needs immediate attention`,
      href: '/invoices',
      count: stats.overdue,
      value: fmt(stats.overdueValue),
      color: WHITE,
      bg: RED,
      urgent: true,
      show: stats.overdue > 0,
    },
    // Review queue — show to reviewers and admins
    {
      icon: '📋',
      title: 'Review Queue',
      description: stats.pendingReview > 0
        ? `${stats.pendingReview} invoice${stats.pendingReview !== 1 ? 's' : ''} waiting for your review`
        : 'Review queue is clear — nice work!',
      href: '/review',
      count: stats.pendingReview,
      countLabel: 'to review',
      color: DARK,
      bg: '#FEF3C7',
      urgent: stats.pendingReview > 0,
      show: ['AP_CLERK','ADMIN','REVIEWER'].includes(role) || !role,
    },
    // Approval queue — show to approvers and admins
    {
      icon: '✅',
      title: 'Approve Queue',
      description: stats.pendingApproval > 0
        ? `${stats.pendingApproval} invoice${stats.pendingApproval !== 1 ? 's' : ''} waiting for your approval`
        : 'Nothing pending approval right now',
      href: '/approve',
      count: stats.pendingApproval,
      countLabel: 'to approve',
      color: DARK,
      bg: '#F0FDF4',
      urgent: stats.pendingApproval > 0,
      show: ['APPROVER','ADMIN'].includes(role) || !role,
    },
    // Ready to push to Xero
    {
      icon: '📤',
      title: 'Push to Xero',
      description: stats.approvedReady > 0
        ? `${stats.approvedReady} approved invoice${stats.approvedReady !== 1 ? 's' : ''} ready to post`
        : 'No invoices waiting to be pushed',
      href: '/xero-push',
      count: stats.approvedReady,
      countLabel: 'ready',
      color: WHITE,
      bg: TEAL,
      urgent: stats.approvedReady > 0,
      show: ['ADMIN','APPROVER'].includes(role) || !role,
    },
    // Dashboard
    {
      icon: '📊',
      title: 'Dashboard',
      description: `R ${Number(stats.totalPipeline).toLocaleString('en-ZA', { minimumFractionDigits: 0 })} total in pipeline · ${stats.xeroPosted} posted to Xero`,
      href: '/dashboard',
      color: WHITE,
      bg: DARK,
      show: true,
    },
    // Capture
    {
      icon: '📷',
      title: 'Capture Receipt',
      description: 'Photograph and submit an expense receipt for processing',
      href: '/capture',
      color: DARK,
      bg: LIGHT,
      show: true,
    },
  ].filter(c => c.show)

  const cols = isMobile ? 1 : cards.length <= 4 ? 2 : 3

  return (
    <AppShell>
      <div style={{ maxWidth: '900px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>
            {greeting()}{userName ? `, ${userName}` : ''} 👋
          </h1>
          <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>
            Here's what needs your attention today.
          </p>
        </div>

        {/* Overdue banner — extra prominent if exists */}
        {!loading && stats.overdue > 0 && (
          <div onClick={() => router.push('/invoices')}
            style={{ backgroundColor: RED, borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '28px' }}>🚨</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: WHITE }}>
                  {stats.overdue} Overdue Invoice{stats.overdue !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
                  {fmt(stats.overdueValue)} past due date — action required
                </div>
              </div>
            </div>
            <div style={{ color: WHITE, fontSize: '20px', flexShrink: 0 }}>→</div>
          </div>
        )}

        {/* Action cards */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ backgroundColor: WHITE, borderRadius: '12px', border: `1px solid ${BORDER}`, padding: '24px', height: '130px', opacity: 0.4 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px' }}>
            {cards.filter(c => c.icon !== '🚨').map((card, i) => (
              <div key={i} onClick={() => router.push(card.href)}
                style={{
                  backgroundColor: card.bg, borderRadius: '12px',
                  border: card.urgent ? `2px solid ${card.color === WHITE ? 'rgba(255,255,255,0.3)' : AMBER}` : `1px solid ${BORDER}`,
                  padding: '20px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: card.urgent ? '0 4px 20px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = card.urgent ? '0 4px 20px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                {/* Count badge */}
                {card.count !== undefined && card.count > 0 && (
                  <div style={{ position: 'absolute', top: '16px', right: '16px', backgroundColor: card.color === WHITE ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', borderRadius: '20px', padding: '3px 10px', fontSize: '13px', fontWeight: '700', color: card.color }}>
                    {card.count} {card.countLabel}
                  </div>
                )}
                {card.count !== undefined && card.count === 0 && (
                  <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                    <span style={{ fontSize: '18px' }}>✓</span>
                  </div>
                )}

                <div style={{ fontSize: '32px', marginBottom: '10px' }}>{card.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: card.color, marginBottom: '6px' }}>{card.title}</div>
                <div style={{ fontSize: '12px', color: card.color === WHITE ? 'rgba(255,255,255,0.65)' : MUTED, lineHeight: 1.5 }}>{card.description}</div>

                {card.value && (
                  <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: '600', color: card.color === WHITE ? 'rgba(255,255,255,0.85)' : DARK }}>{card.value}</div>
                )}

                {/* Arrow */}
                <div style={{ position: 'absolute', bottom: '18px', right: '18px', color: card.color === WHITE ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.15)', fontSize: '20px' }}>→</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
