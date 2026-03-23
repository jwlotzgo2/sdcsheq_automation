'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const WHITE  = '#FFFFFF'
const MUTED  = '#8A8878'
const BORDER = '#E2E0D8'

export interface TourStep {
  id: string
  page: string
  title: string
  body: string
  targetSelector?: string   // CSS selector to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  beforeStep?: () => void
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    page: '/dashboard',
    title: 'Welcome to GoAutomate 👋',
    body: 'This quick tour will walk you through the full AP automation workflow — from receiving an invoice by email all the way through to posting it in Xero. It takes about 2 minutes.',
    position: 'center',
  },
  {
    id: 'dashboard-overview',
    page: '/dashboard',
    title: 'Your Dashboard',
    body: 'The dashboard gives you a real-time view of the AP pipeline. KPI cards show how many invoices are waiting for action, the pipeline flow shows where everything is, and the aging grid flags anything that\'s been sitting too long.',
    targetSelector: 'h1',
    position: 'bottom',
  },
  {
    id: 'email-ingestion',
    page: '/dashboard',
    title: 'Step 1 — Invoice Arrives by Email',
    body: 'Suppliers send invoices to your dedicated Postmark email address. GoAutomate receives them automatically, extracts the PDF, and stores it. No manual downloading required.',
    position: 'center',
  },
  {
    id: 'ai-extraction',
    page: '/dashboard',
    title: 'Step 2 — AI Extraction',
    body: 'Claude AI reads each PDF and extracts the supplier name, invoice number, dates, line items, amounts, and VAT. It also suggests the correct GL code based on the supplier. This happens in seconds.',
    position: 'center',
  },
  {
    id: 'review-queue-nav',
    page: '/dashboard',
    title: 'Step 3 — Review Queue',
    body: 'Extracted invoices land in the Review Queue. A reviewer checks the data, corrects any GL codes if needed, matches the supplier, and submits for approval. Let\'s go there now.',
    targetSelector: 'a[href="/review"]',
    position: 'right',
  },
  {
    id: 'review-list',
    page: '/review',
    title: 'Review Queue — Invoice List',
    body: 'All invoices pending review appear here. Each row shows the supplier, invoice number, date, and amount. Tap or click any invoice to open the detail view.',
    position: 'center',
  },
  {
    id: 'review-detail',
    page: '/review',
    title: 'Reviewing an Invoice',
    body: 'The detail view shows everything Claude extracted — supplier, dates, line items, and suggested GL codes. You can correct the supplier match and adjust GL codes before submitting. The original PDF is always visible on the right (or as a full-screen modal on mobile).',
    position: 'center',
  },
  {
    id: 'review-submit',
    page: '/review',
    title: 'Submit for Approval',
    body: 'Once you\'re happy with the data, click "Submit for Approval". The invoice moves to the Approval Queue and the approver gets notified. You can also Reject an invoice with a reason — it will be flagged and removed from the pipeline.',
    position: 'center',
  },
  {
    id: 'approve-queue-nav',
    page: '/review',
    title: 'Step 4 — Approval Queue',
    body: 'The approver has their own queue. They can see the reviewer\'s notes, check the PDF, and either Approve, Return to the reviewer, or Reject. Let\'s go there now.',
    targetSelector: 'a[href="/approve"]',
    position: 'right',
  },
  {
    id: 'approve-action',
    page: '/approve',
    title: 'Approving an Invoice',
    body: 'The approver sees the full invoice detail including any notes left by the reviewer. One tap to Approve — or Return if something needs to be corrected. Approval is the final human step in the process.',
    position: 'center',
  },
  {
    id: 'xero-push',
    page: '/invoices',
    title: 'Step 5 — Push to Xero',
    body: 'Approved invoices appear on the Invoices page with a "Push to Xero" button. You can review the full batch, see the total value, and submit them all to Xero as draft bills in one click.',
    targetSelector: 'button',
    position: 'bottom',
  },
  {
    id: 'xero-result',
    page: '/invoices',
    title: 'Posted in Xero',
    body: 'Once pushed, invoices are marked "Xero Posted" and a bill is created in your Xero account. GoAutomate periodically checks Xero and updates the status to "Paid" once payment is recorded.',
    position: 'center',
  },
  {
    id: 'duplicates',
    page: '/duplicates',
    title: 'Duplicate Detection',
    body: 'GoAutomate automatically detects when a supplier sends the same invoice more than once. Duplicates are blocked and logged here so you can track which suppliers are resubmitting and follow up with them.',
    position: 'center',
  },
  {
    id: 'done',
    page: '/dashboard',
    title: 'You\'re all set! 🎉',
    body: 'That\'s the full workflow. If you ever get stuck, come back to the Help page or click the ? in the top bar. You can also replay this tour any time.\n\nGot a question or issue? Email the Go 2 Analytics team directly from the Help page.',
    position: 'center',
  },
]

const STORAGE_KEY = 'goautomate_tour_step'
const ACTIVE_KEY  = 'goautomate_tour_active'

export function useTour() {
  const startTour = () => {
    localStorage.setItem(ACTIVE_KEY, '1')
    localStorage.setItem(STORAGE_KEY, '0')
    window.location.href = '/dashboard'
  }
  const stopTour = () => {
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(STORAGE_KEY)
  }
  return { startTour, stopTour }
}

export default function TourOverlay() {
  const [step, setStep]           = useState<number | null>(null)
  const [highlight, setHighlight] = useState<DOMRect | null>(null)
  const [mounted, setMounted]     = useState(false)
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const active = localStorage.getItem(ACTIVE_KEY)
    if (!active) return
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0')
    setStep(saved)
  }, [mounted, pathname])

  useEffect(() => {
    if (step === null) return
    const current = TOUR_STEPS[step]
    if (!current) return

    // Navigate to the right page if needed
    if (pathname !== current.page) {
      router.push(current.page)
      return
    }

    // Highlight target element
    if (current.targetSelector) {
      setTimeout(() => {
        const el = document.querySelector(current.targetSelector!)
        if (el) setHighlight(el.getBoundingClientRect())
        else setHighlight(null)
      }, 300)
    } else {
      setHighlight(null)
    }
  }, [step, pathname])

  const goNext = useCallback(() => {
    if (step === null) return
    const next = step + 1
    if (next >= TOUR_STEPS.length) {
      localStorage.removeItem(ACTIVE_KEY)
      localStorage.removeItem(STORAGE_KEY)
      setStep(null)
      router.push('/dashboard')
      return
    }
    localStorage.setItem(STORAGE_KEY, String(next))
    setStep(next)
  }, [step, router])

  const goBack = useCallback(() => {
    if (step === null || step === 0) return
    const prev = step - 1
    localStorage.setItem(STORAGE_KEY, String(prev))
    setStep(prev)
  }, [step, router])

  const skipTour = () => {
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(STORAGE_KEY)
    setStep(null)
  }

  if (!mounted || step === null) return null

  const current = TOUR_STEPS[step]
  if (!current || pathname !== current.page) return null

  const isCenter = current.position === 'center' || !current.targetSelector

  // Calculate tooltip position
  let tooltipStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 1001,
    backgroundColor: WHITE, borderRadius: '14px',
    padding: '24px', width: '320px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    border: `1px solid ${BORDER}`,
  }

  if (isCenter) {
    tooltipStyle = { ...tooltipStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (highlight) {
    const margin = 12
    if (current.position === 'bottom') {
      tooltipStyle = { ...tooltipStyle, top: highlight.bottom + margin, left: Math.max(12, highlight.left) }
    } else if (current.position === 'right') {
      tooltipStyle = { ...tooltipStyle, top: highlight.top, left: highlight.right + margin }
    } else if (current.position === 'top') {
      tooltipStyle = { ...tooltipStyle, bottom: window.innerHeight - highlight.top + margin, left: Math.max(12, highlight.left) }
    } else {
      tooltipStyle = { ...tooltipStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  } else {
    tooltipStyle = { ...tooltipStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1000 }} />

      {/* Highlight ring around target */}
      {highlight && !isCenter && (
        <div style={{
          position: 'fixed', zIndex: 1001, pointerEvents: 'none',
          top: highlight.top - 4, left: highlight.left - 4,
          width: highlight.width + 8, height: highlight.height + 8,
          borderRadius: '8px', border: `3px solid ${AMBER}`,
          boxShadow: `0 0 0 4px rgba(232,150,12,0.25)`,
        }} />
      )}

      {/* Tooltip */}
      <div style={tooltipStyle}>
        {/* Progress */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{ width: i === step ? '16px' : '6px', height: '6px', borderRadius: '3px', backgroundColor: i === step ? AMBER : i < step ? '#D1B07A' : '#E2E0D8', transition: 'width 0.2s' }} />
            ))}
          </div>
          <button onClick={skipTour} style={{ background: 'none', border: 'none', fontSize: '12px', color: MUTED, cursor: 'pointer', padding: '2px 6px' }}>
            Skip tour
          </button>
        </div>

        {/* Content */}
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: DARK, margin: '0 0 10px', lineHeight: 1.3 }}>
          {current.title}
        </h3>
        <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.6, margin: '0 0 20px', whiteSpace: 'pre-line' }}>
          {current.body}
        </p>

        {/* Step counter + actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: MUTED }}>{step + 1} of {TOUR_STEPS.length}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 0 && (
              <button onClick={goBack} style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                ← Back
              </button>
            )}
            <button onClick={goNext} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
              {step === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
