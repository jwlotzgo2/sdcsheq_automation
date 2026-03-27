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
  targetSelector?: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    page: '/',
    title: 'Welcome to GoAutomate 👋',
    body: 'This quick tour walks you through the full AP automation workflow — from receiving an invoice by email all the way through to posting it in Xero. It takes about 2 minutes.',
    position: 'center',
  },
  {
    id: 'home-overview',
    page: '/',
    title: 'Your Home Screen',
    body: 'The home screen is your action centre. It shows everything that needs your attention right now — overdue invoices, queues waiting for action, and quick links to capture expenses or view the dashboard. The counts update in real time.',
    targetSelector: 'h1',
    position: 'bottom',
  },
  {
    id: 'overdue-banner',
    page: '/',
    title: 'Overdue Alerts',
    body: 'If any invoices are past their due date, a red banner appears at the top. This is urgent — tap it to go straight to the invoices list and take action.',
    position: 'center',
  },
  {
    id: 'email-ingestion',
    page: '/',
    title: 'Step 1 — Invoice Arrives by Email',
    body: 'Suppliers email invoices to your dedicated Postmark address. GoAutomate receives them automatically, extracts the PDF, and queues them for processing. No manual downloading or forwarding needed.',
    position: 'center',
  },
  {
    id: 'ai-extraction',
    page: '/',
    title: 'Step 2 — AI Extraction',
    body: 'Claude AI reads each PDF and extracts the supplier name, invoice number, dates, line items, amounts, and VAT. It also suggests the correct GL code from your live Xero chart of accounts. This happens in seconds.',
    position: 'center',
  },
  {
    id: 'review-queue-intro',
    page: '/',
    title: 'Step 3 — Review Queue',
    body: 'Extracted invoices land in the Review Queue. A reviewer checks the extracted data, confirms the GL codes, matches the supplier, and submits for approval. Any corrections you make are remembered for future invoices from the same supplier.',
    targetSelector: 'h1',
    position: 'center',
  },
  {
    id: 'review-list',
    page: '/review',
    title: 'Review Queue — Invoice List',
    body: 'All invoices pending review are listed here. Invoices tagged EXPENSE are expense receipts submitted by staff. Tap or click any invoice to open the detail view.',
    position: 'center',
  },
  {
    id: 'review-detail',
    page: '/review',
    title: 'Reviewing an Invoice',
    body: 'The detail view shows everything Claude extracted — supplier, dates, line items, and GL codes. You can correct the supplier, adjust GL codes, and add a note for the approver. The original PDF is always visible on the right.',
    position: 'center',
  },
  {
    id: 'review-submit',
    page: '/review',
    title: 'Submit or Reject',
    body: 'Once you\'re happy with the data, click "Submit for Approval". The invoice moves to the Approval Queue. You can also Reject an invoice — it\'s flagged and removed from the pipeline. If an approver returns something, the return reason appears in amber at the top.',
    position: 'center',
  },
  {
    id: 'approve-intro',
    page: '/approve',
    title: 'Step 4 — Approve Queue',
    body: 'The approver sees all invoices submitted for approval. They can check the reviewer\'s notes, view the PDF, then Approve, Return to the reviewer with a note, or Reject. Approvers can also override GL codes if needed.',
    position: 'center',
  },
  {
    id: 'xero-push-intro',
    page: '/xero-push',
    title: 'Step 5 — Push to Xero',
    body: 'Approved invoices appear here. Select which ones to push, check the total batch value, then submit. Each invoice is posted to Xero as a draft bill. Progress is shown live — you\'ll see a tick or error for each one.',
    position: 'center',
  },
  {
    id: 'xero-sync',
    page: '/xero-push',
    title: 'Xero Sync',
    body: 'GoAutomate syncs with Xero daily at 6am — pulling updated GL codes, suppliers, and checking payment status. Once a bill is marked paid in Xero, the invoice here updates to "Paid" automatically.',
    position: 'center',
  },
  {
    id: 'expenses-intro',
    page: '/expenses',
    title: 'Expense Capture',
    body: 'Staff with expense capture permission can photograph receipts on their phone. The AI extracts the vendor, amount, and date. They assign a GL code and cost centre, then submit — it flows through the same review and approval process.',
    position: 'center',
  },
  {
    id: 'duplicates-intro',
    page: '/duplicates',
    title: 'Duplicate Detection',
    body: 'GoAutomate automatically blocks duplicate invoices using a PDF fingerprint. If a supplier sends the same invoice twice, the second one is logged here instead of entering the pipeline.',
    position: 'center',
  },
  {
    id: 'chat-intro',
    page: '/',
    title: 'Team Chat 💬',
    body: 'The chat button at the bottom right opens the team chat. You can start a conversation on any specific invoice — useful when a reviewer needs to flag something for the approver without rejecting or returning the invoice.',
    position: 'center',
  },
  {
    id: 'done',
    page: '/',
    title: 'You\'re all set! 🎉',
    body: 'That\'s the full GoAutomate workflow. Come back to the Help page or tap the ? button any time to replay this tour or find answers.\n\nGot a question? Email the Go 2 Analytics team from the Help page.',
    position: 'center',
  },
]

const STORAGE_KEY = 'goautomate_tour_step'
const ACTIVE_KEY  = 'goautomate_tour_active'

export function useTour() {
  const startTour = () => {
    localStorage.setItem(ACTIVE_KEY, '1')
    localStorage.setItem(STORAGE_KEY, '0')
    window.location.href = '/'
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
    if (pathname !== current.page) {
      router.push(current.page)
      return
    }
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
      router.push('/')
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
  }, [step])

  const skipTour = () => {
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(STORAGE_KEY)
    setStep(null)
  }

  if (!mounted || step === null) return null

  const current = TOUR_STEPS[step]
  if (!current || pathname !== current.page) return null

  const isCenter = current.position === 'center' || !current.targetSelector

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
    if (current.position === 'bottom')
      tooltipStyle = { ...tooltipStyle, top: highlight.bottom + margin, left: Math.max(12, Math.min(highlight.left, window.innerWidth - 340)) }
    else if (current.position === 'right')
      tooltipStyle = { ...tooltipStyle, top: highlight.top, left: highlight.right + margin }
    else if (current.position === 'top')
      tooltipStyle = { ...tooltipStyle, bottom: window.innerHeight - highlight.top + margin, left: Math.max(12, highlight.left) }
    else
      tooltipStyle = { ...tooltipStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    tooltipStyle = { ...tooltipStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1000 }} />
      {highlight && !isCenter && (
        <div style={{ position: 'fixed', zIndex: 1001, pointerEvents: 'none', top: highlight.top - 4, left: highlight.left - 4, width: highlight.width + 8, height: highlight.height + 8, borderRadius: '8px', border: `3px solid ${AMBER}`, boxShadow: `0 0 0 4px rgba(232,150,12,0.25)` }} />
      )}
      <div style={tooltipStyle}>
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
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: DARK, margin: '0 0 10px', lineHeight: 1.3 }}>
          {current.title}
        </h3>
        <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.6, margin: '0 0 20px', whiteSpace: 'pre-line' }}>
          {current.body}
        </p>
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
