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

export default function WelcomePopup() {
  const [show, setShow]           = useState(false)
  const [reviewCount, setReviewCount]   = useState(0)
  const [approveCount, setApproveCount] = useState(0)
  const [userName, setUserName]   = useState('')
  const [mounted, setMounted]     = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    checkAndShow()
  }, [mounted])

  const checkAndShow = async () => {
    // Check last shown time
    const lastShown = localStorage.getItem('goautomate_welcome_shown')
    const now = Date.now()
    const twelveHours = 12 * 60 * 60 * 1000

    if (lastShown && now - parseInt(lastShown) < twelveHours) return

    // Fetch user and counts
    const [{ data: { user } }, { count: rc }, { count: ac }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED']),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
    ])

    const name = user?.email?.split('@')[0] ?? 'there'
    setUserName(name.charAt(0).toUpperCase() + name.slice(1))
    setReviewCount(rc ?? 0)
    setApproveCount(ac ?? 0)
    setShow(true)
  }

  const dismiss = () => {
    localStorage.setItem('goautomate_welcome_shown', Date.now().toString())
    setShow(false)
  }

  const goToReview = () => {
    dismiss()
    router.push('/review')
  }

  const goToApprove = () => {
    dismiss()
    router.push('/approve')
  }

  if (!mounted || !show) return null

  const allClear = reviewCount === 0 && approveCount === 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            backgroundColor: WHITE, borderRadius: '16px', padding: '36px 40px',
            width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
            position: 'relative',
          }}
        >
          {/* Close */}
          <button
            onClick={dismiss}
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>

          {/* GoAutomate badge */}
          <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '3px 10px', marginBottom: '16px' }}>
            <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.08em' }}>GoAutomate</span>
          </div>

          {allClear ? (
            <>
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: DARK, margin: '0 0 10px' }}>
                Welcome back, {userName} 👋
              </h2>
              <p style={{ fontSize: '15px', color: MUTED, margin: '0 0 28px', lineHeight: 1.6 }}>
                You're all caught up. No invoices pending review or approval.
              </p>
              <div style={{ backgroundColor: '#F0FDF4', borderRadius: '10px', padding: '20px', textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>☕</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: OLIVE }}>Go enjoy a coffee.</div>
                <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>The AP pipeline is clear.</div>
              </div>
              <button
                onClick={dismiss}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
              >
                Go to Dashboard
              </button>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: DARK, margin: '0 0 10px' }}>
                Welcome back, {userName} 👋
              </h2>
              <p style={{ fontSize: '14px', color: MUTED, margin: '0 0 20px' }}>
                Here's where things stand right now:
              </p>

              {/* Queue cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {reviewCount > 0 && (
                  <div style={{ backgroundColor: '#FEF3C7', borderRadius: '10px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: AMBER, marginBottom: '2px' }}>
                        📋 Review Queue
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: DARK }}>
                        {reviewCount} invoice{reviewCount !== 1 ? 's' : ''} waiting
                      </div>
                    </div>
                    <button
                      onClick={goToReview}
                      style={{ padding: '8px 16px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Review →
                    </button>
                  </div>
                )}

                {approveCount > 0 && (
                  <div style={{ backgroundColor: '#F0FDF4', borderRadius: '10px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: OLIVE, marginBottom: '2px' }}>
                        ✅ Approval Queue
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: DARK }}>
                        {approveCount} invoice{approveCount !== 1 ? 's' : ''} pending
                      </div>
                    </div>
                    <button
                      onClick={goToApprove}
                      style={{ padding: '8px 16px', borderRadius: '7px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Approve →
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={dismiss}
                style={{ width: '100%', padding: '11px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Dismiss — I'll check later
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
