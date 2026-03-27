'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useTour } from '@/components/TourOverlay'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const TEAL   = '#13B5EA'

const FAQS = [
  { q: 'Why didn\'t my invoice come through?', a: 'Check that the supplier sent the invoice to the correct Postmark email address. The invoice must be attached as a PDF — emails with no PDF attachment are logged but no invoice is created.' },
  { q: 'What does "Pending Review" mean?', a: 'The AI has extracted the invoice data and it\'s waiting for a reviewer to check the GL codes, confirm the supplier match, and submit it for approval. Nothing goes to Xero until it\'s been reviewed and approved.' },
  { q: 'What is a GL code and why does it matter?', a: 'A GL (General Ledger) code is the account category in Xero that the expense is posted to. Correct GL coding ensures your financial reports are accurate. The AI suggests a GL code based on the supplier and line items, but a reviewer can always change it.' },
  { q: 'Can I approve an invoice from my phone?', a: 'Yes. The app is fully mobile-responsive. The approve queue on mobile shows a clean list — tap any invoice to open the detail view, check the PDF, and approve with one tap. You can also install GoAutomate on your home screen for faster access.' },
  { q: 'What happens after I approve an invoice?', a: 'Approved invoices sit in the queue until someone uses the "Push to Xero" button. This submits them to Xero as draft bills. GoAutomate then monitors Xero and updates the status to "Paid" once payment is recorded.' },
  { q: 'Why is the same invoice showing more than once?', a: 'GoAutomate detects duplicate PDFs using a SHA-256 hash — if the exact same PDF is sent twice, the second one is blocked and logged in the Duplicates page.' },
  { q: 'How do I add a new supplier?', a: 'Suppliers are synced from Xero. If a new supplier needs to be added, you can create them directly from the Review Queue — a "+ Xero" button appears when no supplier match is found.' },
  { q: 'How do I return an invoice to the reviewer?', a: 'On the Approval Queue, click "Return to Reviewer" and add a note. The invoice goes back with your comment highlighted in amber.' },
  { q: 'What does "Xero Posted" mean vs "Paid"?', a: '"Xero Posted" means the bill has been created in Xero as a draft. "Paid" means Xero has recorded payment. GoAutomate syncs with Xero daily and updates the status automatically.' },
  { q: 'How do I capture an expense receipt?', a: 'If you have expense capture permission, go to the Capture page from the nav. Photograph your receipt — the AI extracts the vendor, amounts, and date. Fill in the GL code and cost centre, then submit. It goes through the same review and approval flow.' },
  { q: 'Can I replay the tour?', a: 'Yes — click the "Start interactive tour" button on this page or the ? icon in the top bar at any time.' },
]

// PWA Section — isolated component to avoid re-render issues
function PwaSection() {
  const [isInstalled, setIsInstalled]       = useState(false)
  const [notifStatus, setNotifStatus]       = useState<NotificationPermission | 'unsupported'>('default')
  const [installPrompt, setInstallPrompt]   = useState<any>(null)
  const [canInstall, setCanInstall]         = useState(false)
  const [mounted, setMounted]               = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }
    // Check notification status
    if ('Notification' in window) {
      setNotifStatus(Notification.permission)
    } else {
      setNotifStatus('unsupported')
    }
    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler as any)
    return () => window.removeEventListener('beforeinstallprompt', handler as any)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setIsInstalled(true); setCanInstall(false) }
  }

  const handleNotif = async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setNotifStatus(permission)
    if (permission === 'granted') {
      new Notification('GoAutomate notifications enabled', {
        body: 'You\'ll be notified when invoices need your attention.',
        icon: '/icons/icon-192.png',
      })
    }
  }

  if (!mounted) return null

  return (
    <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>App Installation & Notifications</h2>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Install */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '3px' }}>📱 Install GoAutomate</div>
            <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>
              {isInstalled
                ? 'GoAutomate is installed on your device.'
                : 'Add GoAutomate to your home screen for quick access — works like a native app, even offline.'}
            </div>
          </div>
          {isInstalled ? (
            <span style={{ fontSize: '12px', fontWeight: '600', color: OLIVE, backgroundColor: '#F0FDF4', padding: '5px 12px', borderRadius: '20px', flexShrink: 0 }}>✓ Installed</span>
          ) : canInstall ? (
            <button onClick={handleInstall}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
              Install
            </button>
          ) : (
            <span style={{ fontSize: '11px', color: MUTED, flexShrink: 0 }}>Use browser menu → "Add to Home Screen"</span>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}` }} />

        {/* Notifications */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: DARK, marginBottom: '3px' }}>🔔 Push Notifications</div>
            <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>
              {notifStatus === 'granted'
                ? 'Notifications are enabled. You\'ll be alerted when invoices need your attention.'
                : notifStatus === 'denied'
                ? 'Notifications are blocked. Enable them in your browser settings.'
                : notifStatus === 'unsupported'
                ? 'Push notifications are not supported on this browser.'
                : 'Get notified when invoices land in your queue or need urgent attention.'}
            </div>
          </div>
          {notifStatus === 'granted' ? (
            <span style={{ fontSize: '12px', fontWeight: '600', color: OLIVE, backgroundColor: '#F0FDF4', padding: '5px 12px', borderRadius: '20px', flexShrink: 0 }}>✓ Enabled</span>
          ) : notifStatus === 'denied' ? (
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#EF4444', backgroundColor: '#FEE2E2', padding: '5px 12px', borderRadius: '20px', flexShrink: 0 }}>Blocked</span>
          ) : notifStatus === 'unsupported' ? (
            <span style={{ fontSize: '12px', color: MUTED, flexShrink: 0 }}>Not supported</span>
          ) : (
            <button onClick={handleNotif}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: TEAL, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
              Allow
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const { startTour } = useTour()

  return (
    <AppShell>
      <div style={{ maxWidth: '760px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Help & Guidance</h1>
          <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>Learn how to use GoAutomate, get answers to common questions, or reach out for support.</p>
        </div>

        {/* Tour card */}
        <div style={{ backgroundColor: DARK, borderRadius: '12px', padding: '24px 28px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-block', backgroundColor: AMBER, borderRadius: '4px', padding: '2px 10px', marginBottom: '10px' }}>
              <span style={{ color: WHITE, fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.08em' }}>Interactive Tour</span>
            </div>
            <h2 style={{ color: WHITE, fontSize: '17px', fontWeight: '700', margin: '0 0 6px' }}>New to GoAutomate?</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
              Take the 2-minute guided tour — we'll walk you through the full invoice workflow, expense capture, and Xero integration.
            </p>
          </div>
          <button onClick={startTour}
            style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Start tour →
          </button>
        </div>

        {/* Workflow summary */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '20px 24px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How it works</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { step: '1', icon: '📧', label: 'Invoice received by email',   color: '#3B82F6' },
              { step: '2', icon: '🤖', label: 'AI extracts data from PDF',   color: '#8B5CF6' },
              { step: '3', icon: '📋', label: 'Reviewer checks GL codes',    color: AMBER },
              { step: '4', icon: '✅', label: 'Approver signs off',           color: OLIVE },
              { step: '5', icon: '📤', label: 'Posted to Xero as a bill',    color: TEAL },
              { step: '6', icon: '💰', label: 'Payment status syncs back',   color: '#166534' },
            ].map(({ step, icon, label, color }, i, arr) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: `${color}18`, border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                    {icon}
                  </div>
                  {i < arr.length - 1 && <div style={{ width: '2px', height: '20px', backgroundColor: BORDER }} />}
                </div>
                <div style={{ paddingBottom: i < arr.length - 1 ? '20px' : '0' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: MUTED, marginRight: '6px' }}>Step {step}</span>
                  <span style={{ fontSize: '14px', color: DARK }}>{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PWA section */}
        <PwaSection />

        {/* FAQ */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frequently Asked Questions</h2>
          </div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${LIGHT}` : 'none' }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: DARK }}>{faq.q}</span>
                <span style={{ fontSize: '18px', color: AMBER, flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: '0 20px 16px', fontSize: '13px', color: '#555', lineHeight: 1.7 }}>{faq.a}</div>
              )}
            </div>
          ))}
        </div>

        {/* Contact support */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '20px 24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Need more help?</h2>
          <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
            Can't find what you're looking for? The Go 2 Analytics team is here to help.
          </p>
          <a href="mailto:support@go2analytics.co.za?subject=GoAutomate Support Request&body=Hi Go 2 Analytics team,%0A%0AI need help with:%0A%0A"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 20px', borderRadius: '8px', backgroundColor: DARK, color: WHITE, fontSize: '13px', fontWeight: '700', textDecoration: 'none' }}>
            ✉ Email support@go2analytics.co.za
          </a>
        </div>

      </div>
    </AppShell>
  )
}
