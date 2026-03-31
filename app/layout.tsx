import type { Metadata, Viewport } from 'next'
import './globals.css'
import PwaPrompt from '@/components/PwaPrompt'
import PageTransition from '@/components/PageTransition'

export const metadata: Metadata = {
  title: 'GoAutomate — SDC SHEQ',
  description: 'AP Automation for SDC SHEQ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GoAutomate',
  },
}

export const viewport: Viewport = {
  themeColor: '#E8960C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GoAutomate" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <PageTransition>
          {children}
        </PageTransition>
        <PwaPrompt />
      </body>
    </html>
  )
}
