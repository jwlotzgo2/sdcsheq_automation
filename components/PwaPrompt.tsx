'use client'

import { useEffect, useState } from 'react'

const AMBER = '#E8960C'
const DARK  = '#2A2A2A'
const OLIVE = '#5B6B2D'
const WHITE = '#FFFFFF'
const BORDER = '#E2E0D8'

export default function PwaPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showInstall, setShowInstall]     = useState(false)
  const [showNotif, setShowNotif]         = useState(false)
  const [installed, setInstalled]         = useState(false)
  const [mounted, setMounted]             = useState(false)

  useEffect(() => {
    setMounted(true)

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      // If installed, just check notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        const lastAsked = localStorage.getItem('goautomate_notif_asked')
        if (!lastAsked) setShowNotif(true)
      }
      return
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      const dismissed = localStorage.getItem('goautomate_install_dismissed')
      if (!dismissed) setShowInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler as any)
    return () => window.removeEventListener('beforeinstallprompt', handler as any)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
      setShowInstall(false)
      // After install, ask for notifications
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'default') {
          setShowNotif(true)
        }
      }, 1500)
    } else {
      setShowInstall(false)
      localStorage.setItem('goautomate_install_dismissed', '1')
    }
  }

  const handleNotifAllow = async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    localStorage.setItem('goautomate_notif_asked', '1')
    setShowNotif(false)
    if (permission === 'granted') {
      // Show a test notification
      new Notification('GoAutomate notifications enabled', {
        body: "You'll be notified when invoices need your attention.",
        icon: '/icons/icon-192.png',
      })
    }
  }

  const handleNotifDismiss = () => {
    localStorage.setItem('goautomate_notif_asked', '1')
    setShowNotif(false)
  }

  if (!mounted) return null

  return (
    <>
      {/* Install prompt */}
      {showInstall && (
        <div style={{
          position: 'fixed', bottom: '70px', left: '12px', right: '12px',
          backgroundColor: WHITE, borderRadius: '14px', padding: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: `1px solid ${BORDER}`,
          zIndex: 200, display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: AMBER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
            ⚡
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: DARK, marginBottom: '3px' }}>Install GoAutomate</div>
            <div style={{ fontSize: '12px', color: '#8A8878', marginBottom: '12px', lineHeight: 1.4 }}>Add to your home screen for quick access to your invoice queues.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleInstall} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                Install
              </button>
              <button onClick={() => { setShowInstall(false); localStorage.setItem('goautomate_install_dismissed', '1') }}
                style={{ padding: '9px 14px', borderRadius: '8px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: '#8A8878', fontSize: '13px', cursor: 'pointer' }}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification prompt */}
      {showNotif && !showInstall && (
        <div style={{
          position: 'fixed', bottom: '70px', left: '12px', right: '12px',
          backgroundColor: WHITE, borderRadius: '14px', padding: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: `1px solid ${BORDER}`,
          zIndex: 200, display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#EBF4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
            🔔
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: DARK, marginBottom: '3px' }}>Stay on top of your queues</div>
            <div style={{ fontSize: '12px', color: '#8A8878', marginBottom: '12px', lineHeight: 1.4 }}>Allow notifications to get alerted when invoices need your review or approval.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleNotifAllow} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', backgroundColor: OLIVE, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                Allow notifications
              </button>
              <button onClick={handleNotifDismiss} style={{ padding: '9px 14px', borderRadius: '8px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: '#8A8878', fontSize: '13px', cursor: 'pointer' }}>
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
