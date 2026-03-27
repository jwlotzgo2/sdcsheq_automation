'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'

const fmtDT = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

export default function InvoiceChat() {
  const [open, setOpen]               = useState(false)
  const [invoices, setInvoices]       = useState<any[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [comments, setComments]       = useState<any[]>([])
  const [message, setMessage]         = useState('')
  const [sending, setSending]         = useState(false)
  const [userEmail, setUserEmail]     = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [mounted, setMounted]         = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? '')
    })
    fetchUnread()
    // Subscribe to new comments
    const channel = supabase
      .channel('invoice_comments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoice_comments' }, payload => {
        if (selectedInvoice && payload.new.invoice_id === selectedInvoice.id) {
          setComments(prev => [...prev, payload.new])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        } else {
          setUnreadCount(prev => prev + 1)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [mounted, selectedInvoice])

  const fetchUnread = async () => {
    const { count } = await supabase
      .from('invoice_comments')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
    setUnreadCount(count ?? 0)
  }

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, supplier_name, invoice_number, status')
      .not('status', 'in', '("REJECTED","XERO_PAID")')
      .order('created_at', { ascending: false })
      .limit(30)
    setInvoices(data ?? [])
  }

  const fetchComments = async (invoiceId: string) => {
    const { data } = await supabase
      .from('invoice_comments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at')
    setComments(data ?? [])
    // Mark as read
    await supabase.from('invoice_comments').update({ is_read: true })
      .eq('invoice_id', invoiceId).eq('is_read', false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    fetchUnread()
  }

  const handleOpen = () => {
    setOpen(true)
    fetchInvoices()
  }

  const selectInvoice = (inv: any) => {
    setSelectedInvoice(inv)
    fetchComments(inv.id)
  }

  const sendMessage = async () => {
    if (!message.trim() || !selectedInvoice) return
    setSending(true)
    await supabase.from('invoice_comments').insert({
      invoice_id: selectedInvoice.id,
      user_email: userEmail,
      user_name:  userEmail.split('@')[0],
      message:    message.trim(),
    })
    setMessage('')
    setSending(false)
  }

  if (!mounted) return null

  const panelWidth = isMobile ? '100vw' : '380px'
  const panelHeight = isMobile ? '100vh' : '520px'

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        style={{
          position: 'fixed', bottom: isMobile ? '70px' : '24px', right: '20px',
          width: '52px', height: '52px', borderRadius: '50%',
          backgroundColor: DARK, border: `2px solid ${AMBER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 150, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          fontSize: '22px',
        }}
      >
        💬
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#EF4444', color: WHITE, fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 5px', minWidth: '16px', textAlign: 'center' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <>
          {isMobile && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 160 }} />}
          <div style={{
            position: 'fixed',
            bottom: isMobile ? 0 : '90px',
            right: isMobile ? 0 : '20px',
            width: panelWidth,
            height: panelHeight,
            backgroundColor: WHITE,
            borderRadius: isMobile ? '16px 16px 0 0' : '14px',
            boxShadow: '0 16px 60px rgba(0,0,0,0.25)',
            border: `1px solid ${BORDER}`,
            zIndex: 170,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: DARK, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedInvoice && (
                  <button onClick={() => { setSelectedInvoice(null); setComments([]) }}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '0 4px 0 0' }}>‹</button>
                )}
                <span style={{ fontSize: '14px', fontWeight: '700', color: WHITE }}>
                  {selectedInvoice ? `${selectedInvoice.supplier_name ?? 'Invoice'} · ${selectedInvoice.invoice_number ?? ''}` : 'Team Chat'}
                </span>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {!selectedInvoice ? (
              /* Invoice list */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Select an invoice to discuss
                </div>
                {invoices.map((inv, i) => (
                  <div key={inv.id} onClick={() => selectInvoice(inv)}
                    style={{ padding: '12px 16px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = LIGHT)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = WHITE)}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{inv.supplier_name ?? 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{inv.invoice_number ?? '—'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: LIGHT, color: MUTED }}>{inv.status}</span>
                      <span style={{ color: MUTED, fontSize: '16px' }}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Comments view */
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {comments.length === 0 && (
                    <div style={{ textAlign: 'center', color: MUTED, fontSize: '13px', padding: '20px 0' }}>
                      No messages yet. Start the conversation.
                    </div>
                  )}
                  {comments.map(c => {
                    const isMe = c.user_email === userEmail
                    return (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '80%', backgroundColor: isMe ? AMBER : LIGHT, borderRadius: isMe ? '12px 12px 0 12px' : '12px 12px 12px 0', padding: '8px 12px' }}>
                          <div style={{ fontSize: '13px', color: isMe ? WHITE : DARK, lineHeight: 1.5 }}>{c.message}</div>
                        </div>
                        <div style={{ fontSize: '10px', color: MUTED, marginTop: '3px' }}>
                          {c.user_name ?? c.user_email} · {fmtDT(c.created_at)}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '10px 12px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '8px', flexShrink: 0, backgroundColor: WHITE }}>
                  <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: '9px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '20px', outline: 'none', color: DARK, backgroundColor: LIGHT }}
                  />
                  <button onClick={sendMessage} disabled={sending || !message.trim()}
                    style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', backgroundColor: message.trim() ? AMBER : BORDER, color: WHITE, fontSize: '16px', cursor: message.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ↑
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
