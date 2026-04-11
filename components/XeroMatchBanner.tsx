'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const AMBER = '#E8960C'
const OLIVE = '#5B6B2D'

interface XeroMatchBannerProps {
  invoiceId: string
}

export default function XeroMatchBanner({ invoiceId }: XeroMatchBannerProps) {
  const [match, setMatch] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [linked, setLinked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchMatch = async () => {
    const { data } = await supabase
      .from('xero_invoice_matches')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle()
    setMatch(data)
    setLinked(data?.match_status === 'LINKED')
    setLoading(false)
  }

  useEffect(() => {
    fetchMatch()
  }, [invoiceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/xero/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })
      await fetchMatch()
    } catch (err) {
      console.error('Match refresh failed:', err)
    }
    setRefreshing(false)
  }

  const handleLink = async () => {
    if (!match) return
    setLinking(true)
    try {
      const res = await fetch('/api/xero/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          xero_bill_id: match.xero_bill_id,
          xero_bill_number: match.xero_bill_number,
        }),
      })
      if (res.ok) {
        setLinked(true)
        setMatch((prev: any) => ({ ...prev, match_status: 'LINKED' }))
      }
    } catch (err) {
      console.error('Link failed:', err)
    }
    setLinking(false)
  }

  if (loading) return null

  // No match record or pending
  if (!match || match.match_status === 'PENDING') {
    return (
      <div style={{ backgroundColor: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#64748B' }}>Xero match: checking...</span>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#fff', color: '#64748B', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
          {refreshing ? 'Checking...' : 'Check Now'}
        </button>
      </div>
    )
  }

  // No match found
  if (match.match_status === 'NO_MATCH') {
    return (
      <div style={{ backgroundColor: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>&#9888;</span>
          <span style={{ fontSize: '12px', color: '#92400E', fontWeight: '600' }}>No matching bill found in Xero</span>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #FDE68A', backgroundColor: '#fff', color: AMBER, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
          {refreshing ? 'Checking...' : 'Re-check'}
        </button>
      </div>
    )
  }

  // Linked
  if (linked || match.match_status === 'LINKED') {
    return (
      <div style={{ backgroundColor: '#E6F6F4', borderRadius: '8px', border: '1px solid #A7F3D0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px' }}>&#10003;</span>
        <span style={{ fontSize: '12px', color: '#065F46', fontWeight: '600' }}>
          Linked to Xero bill: {match.xero_bill_number || match.xero_bill_id?.slice(0, 8)}
        </span>
        <span style={{ fontSize: '11px', color: '#047857', marginLeft: '4px' }}>
          ({match.xero_contact_name})
        </span>
      </div>
    )
  }

  // Matched — show details with link button
  const pct = Math.round((match.match_confidence ?? 0) * 100)
  const details = match.match_details ?? {}

  return (
    <div style={{ backgroundColor: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>&#128279;</span>
          <span style={{ fontSize: '12px', color: OLIVE, fontWeight: '700' }}>
            Xero match found ({pct}% confidence)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #BBF7D0', backgroundColor: '#fff', color: '#6B7280', fontSize: '10px', cursor: 'pointer' }}>
            {refreshing ? '...' : 'Refresh'}
          </button>
          <button onClick={handleLink} disabled={linking}
            style={{ padding: '3px 12px', borderRadius: '6px', border: 'none', backgroundColor: OLIVE, color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
            {linking ? 'Linking...' : 'Link to Bill'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: '#374151' }}>
        <span>Bill: <strong>{match.xero_bill_number || '—'}</strong></span>
        <span>Supplier: <strong>{match.xero_contact_name || '—'}</strong></span>
        <span>Amount: <strong>R {Number(match.xero_amount ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong></span>
        <span>Date: <strong>{match.xero_date ? new Date(match.xero_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</strong></span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '10px' }}>
        <span style={{ color: details.supplier_match ? '#059669' : '#DC2626' }}>{details.supplier_match ? '✓' : '✗'} Supplier</span>
        <span style={{ color: details.invoice_number_match ? '#059669' : '#DC2626' }}>{details.invoice_number_match ? '✓' : '✗'} Inv#</span>
        <span style={{ color: details.date_match ? '#059669' : '#DC2626' }}>{details.date_match ? '✓' : '✗'} Date</span>
        <span style={{ color: details.amount_match ? '#059669' : '#DC2626' }}>{details.amount_match ? '✓' : '✗'} Amount</span>
      </div>
    </div>
  )
}
