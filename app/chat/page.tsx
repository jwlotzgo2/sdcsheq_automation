'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
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

export default function ChatPage() {
  const [invoices, setInvoices]             = useState<any[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [comments, setComments]             = useState<any[]>([])
  const [message, setMessage]               = useState('')
  const [sending, setSending]               = useState(false)
  const [userEmail, setUserEmail]           = useState('')
  const [loading, setLoading]               = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile  = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? '')
    })
    fetchInvoices()
  }, [])

  useEffect(() => {
    if (!selectedInvoice) return
    const channel = supabase
      .channel('chat_comments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoice_comments' }, payload => {
        if (payload.new.invoice_id === selectedInvoice.id) {
          setComments(prev => [...prev, payload.new])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedInvoice])

  const fetchInvoices = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('id, supplier_name, invoice_number, status, record_type')
      .not('status', 'in', '("REJECTED","XERO_PAID")')
      .order('created_at', { ascending: false })
      .limit(50)
    setInvoices(data ?? [])
    setLoading(false)
  }

  const selectInvoice = async (inv: any) => {
    setSelectedInvoice(inv)
    const { data } = await supabase
      .from('invoice_comments')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('created_at')
    setComments(data ?? [])
    await supabase.from('invoice_comments').update({ is_read: true })
      .eq('invoice_id', inv.id).eq('is_read', false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150)
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
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const InvoiceList = () => (
    <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
        Select Invoice to Discuss
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No active invoices</div>
        ) : invoices.map(inv => (
          <div key={inv.id} onClick={() => selectInvoice(inv)}
            style={{ padding: '12px 16px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', backgroundColor: selectedInvoice?.id === inv.id ? '#FEF3C7' : WHITE, borderLeft: selectedInvoice?.id === inv.id ? `3px solid ${AMBER}` : '3px solid transparent' }}
            onMouseEnter={e => { if (selectedInvoice?.id !== inv.id) e.currentTarget.style.backgroundColor = LIGHT }}
            onMouseLeave={e => { if (selectedInvoice?.id !== inv.id) e.currentTarget.style.backgroundColor = WHITE }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{inv.supplier_name ?? 'Unknown'}</span>
              {inv.record_type === 'EXPENSE' && <span style={{ fontSize: '9px', fontWeight: '700', color: '#13B5EA', backgroundColor: '#EBF4FF', padding: '1px 5px', borderRadius: '6px', flexShrink: 0 }}>EXPENSE</span>}
            </div>
            <div style={{ fontSize: '11px', color: MUTED }}>{inv.invoice_number ?? '—'} · {inv.status}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const ChatWindow = () => (
    <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, backgroundColor: DARK, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isMobile && (
          <button onClick={() => setSelectedInvoice(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '0 4px 0 0' }}>‹</button>
        )}
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: WHITE }}>{selectedInvoice.supplier_name ?? 'Unknown'}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{selectedInvoice.invoice_number ?? '—'} · {selectedInvoice.status}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {comments.length === 0 && (
          <div style={{ textAlign: 'center', color: MUTED, fontSize: '13px', padding: '20px 0' }}>No messages yet. Start the conversation.</div>
        )}
        {comments.map(c => {
          const isMe = c.user_email === userEmail
          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '80%', backgroundColor: isMe ? AMBER : LIGHT, borderRadius: isMe ? '12px 12px 0 12px' : '12px 12px 12px 0', padding: '10px 14px' }}>
                <div style={{ fontSize: '14px', color: isMe ? WHITE : DARK, lineHeight: 1.5 }}>{c.message}</div>
              </div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>
                {c.user_name ?? c.user_email} · {fmtDT(c.created_at)}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '8px', flexShrink: 0, backgroundColor: WHITE }}>
        <input
          ref={inputRef}
          autoFocus
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '10px 14px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '20px', outline: 'none', color: DARK, backgroundColor: LIGHT }}
        />
        <button onClick={sendMessage} disabled={sending || !message.trim()}
          style={{ width: '42px', height: '42px', borderRadius: '50%', border: 'none', backgroundColor: message.trim() ? AMBER : BORDER, color: WHITE, fontSize: '18px', cursor: message.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ↑
        </button>
      </div>
    </div>
  )

  return (
    <AppShell>
      <div style={{ maxWidth: '960px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Team Chat</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Discuss invoices with your team</p>
        </div>

        {isMobile ? (
          /* Mobile — show either list or chat */
          <div style={{ height: 'calc(100vh - 180px)' }}>
            {!selectedInvoice ? <InvoiceList /> : <ChatWindow />}
          </div>
        ) : (
          /* Desktop — side by side */
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '12px', height: 'calc(100vh - 180px)' }}>
            <InvoiceList />
            {selectedInvoice ? <ChatWindow /> : (
              <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: MUTED }}>
                <div style={{ fontSize: '36px' }}>💬</div>
                <div style={{ fontSize: '14px' }}>Select an invoice to start chatting</div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
