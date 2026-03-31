'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

const AMBER = '#E8960C'

function TopBar() {
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const ref = useRef<any>(null)

  useEffect(() => {
    setVisible(true)
    setWidth(30)
    ref.current = setInterval(() => {
      setWidth(w => {
        if (w >= 85) { clearInterval(ref.current); return 85 }
        return w + (85 - w) * 0.12
      })
    }, 50)
    return () => clearInterval(ref.current)
  }, [])

  const finish = () => {
    clearInterval(ref.current)
    setWidth(100)
    setTimeout(() => setVisible(false), 300)
  }

  useEffect(() => { finish() }, [])

  if (!visible) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, height: '3px', zIndex: 9999,
      width: `${width}%`,
      backgroundColor: AMBER,
      transition: width === 100 ? 'width 0.2s ease, opacity 0.3s ease 0.2s' : 'width 0.4s ease',
      opacity: visible ? 1 : 0,
      borderRadius: '0 2px 2px 0',
      boxShadow: `0 0 8px ${AMBER}`,
    }} />
  )
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname()
  const [key, setKey]         = useState(pathname)
  const [visible, setVisible] = useState(true)
  const [bars, setBars]       = useState<number[]>([])
  const barId = useRef(0)

  useEffect(() => {
    if (pathname === key) return
    // Fade out old content
    setVisible(false)
    // Add loading bar
    const id = ++barId.current
    setBars(b => [...b, id])
    setTimeout(() => {
      setKey(pathname)
      setVisible(true)
      setBars(b => b.filter(x => x !== id))
    }, 120)
  }, [pathname])

  return (
    <>
      {bars.map(id => <TopBar key={id} />)}
      <div style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(5px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
        minHeight: '100%',
      }}>
        {children}
      </div>
    </>
  )
}
