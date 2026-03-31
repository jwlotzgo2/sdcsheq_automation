'use client'

import { useEffect, useState, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import SupplierLayout from '@/components/SupplierShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '14px',
  border: `1.5px solid ${BORDER}`, borderRadius: '8px',
  outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: WHITE,
}

const ProfileForm = memo(function ProfileForm({ initial, supplierId, onSave }: {
  initial: any; supplierId: string; onSave: (msg: string) => void
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [vat, setVat]         = useState(initial?.vat_number ?? '')
  const [email, setEmail]     = useState(initial?.email ?? '')
  const [phone, setPhone]     = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSave = async () => {
    if (!name) { setError('Company name is required.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('suppliers').update({
      name, vat_number: vat || null, email: email || null,
      phone: phone || null, address: address || null,
      updated_at: new Date().toISOString(),
    }).eq('id', supplierId)
    if (err) { setError(err.message); setSaving(false); return }
    onSave('Profile updated successfully')
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: '540px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Company Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your company name" style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>VAT Number</label>
        <input value={vat} onChange={e => setVat(e.target.value)} placeholder="e.g. 4123456789" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="invoices@company.co.za" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 11 000 0000" style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Address</label>
        <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City, Province, Postal Code" rows={3}
          style={{ ...inputStyle, resize: 'none', fontFamily: 'Arial, sans-serif' }} />
      </div>

      {error && <div style={{ backgroundColor: '#FEE2E2', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: RED }}>{error}</div>}

      <button onClick={handleSave} disabled={saving}
        style={{ padding: '13px', borderRadius: '10px', border: 'none', backgroundColor: saving ? '#C8B89A' : AMBER, color: WHITE, fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  )
})

export default function SupplierProfile() {
  const [supplier, setSupplier]     = useState<any>(null)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saveMsg, setSaveMsg]       = useState('')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase.from('user_profiles').select('supplier_id, role').eq('email', data.user.email).maybeSingle()
      if (!['SUPPLIER','AP_ADMIN'].includes(profile?.role ?? '') || !profile.supplier_id) { router.push('/'); return }
      setSupplierId(profile.supplier_id)
      const { data: sup } = await supabase.from('suppliers').select('*').eq('id', profile.supplier_id).single()
      setSupplier(sup)
      setLoading(false)
    })
  }, [])

  const handleSave = (msg: string) => {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  return (
    <SupplierLayout>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Company Profile</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Keep your company details up to date</p>
        </div>

        {saveMsg && (
          <div style={{ backgroundColor: '#F0FDF4', border: `1px solid #BBF7D0`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: OLIVE, fontWeight: '600' }}>
            ✓ {saveMsg}
          </div>
        )}

        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '24px' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: MUTED }}>Loading...</div>
          ) : supplierId && (
            <ProfileForm initial={supplier} supplierId={supplierId} onSave={handleSave} />
          )}
        </div>
      </div>
    </SupplierLayout>
  )
}
