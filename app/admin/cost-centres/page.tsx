'use client'

import { useEffect, useState, memo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const RED    = '#EF4444'

const CostCentreRow = memo(function CostCentreRow({ cc, onToggle, onDelete }: {
  cc: any
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', padding: '10px 14px', borderBottom: `1px solid ${LIGHT}`, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{cc.name}</div>
        {cc.code && <div style={{ fontSize: '11px', color: MUTED }}>{cc.code}</div>}
      </div>
      <div>
        <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', backgroundColor: cc.is_active ? '#F0FDF4' : LIGHT, color: cc.is_active ? OLIVE : MUTED }}>
          {cc.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <button onClick={() => onToggle(cc.id, cc.is_active)}
        style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '11px', cursor: 'pointer' }}>
        {cc.is_active ? 'Disable' : 'Enable'}
      </button>
      <button onClick={() => onDelete(cc.id)}
        style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid #FECACA`, backgroundColor: WHITE, color: RED, fontSize: '11px', cursor: 'pointer' }}>
        Delete
      </button>
    </div>
  )
})

const AddForm = memo(function AddForm({ onAdd }: { onAdd: (name: string, code: string) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px 14px', borderTop: `1px solid ${BORDER}`, backgroundColor: LIGHT }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Cost centre name *"
        style={{ flex: 2, padding: '7px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', outline: 'none', color: DARK, backgroundColor: WHITE }} />
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (optional)"
        style={{ flex: 1, padding: '7px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', outline: 'none', color: DARK, backgroundColor: WHITE }} />
      <button onClick={() => { if (name.trim()) { onAdd(name.trim(), code.trim()); setName(''); setCode('') } }}
        disabled={!name.trim()}
        style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', backgroundColor: name.trim() ? AMBER : '#C8B89A', color: WHITE, fontSize: '13px', fontWeight: '700', cursor: name.trim() ? 'pointer' : 'not-allowed' }}>
        + Add
      </button>
    </div>
  )
})

export default function CostCentresPage() {
  const [costCentres, setCostCentres] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchCostCentres() }, [])

  const fetchCostCentres = async () => {
    setLoading(true)
    const { data } = await supabase.from('cost_centres').select('*').order('name')
    setCostCentres(data ?? [])
    setLoading(false)
  }

  const handleAdd = async (name: string, code: string) => {
    await supabase.from('cost_centres').insert({ name, code: code || null })
    fetchCostCentres()
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('cost_centres').update({ is_active: !isActive }).eq('id', id)
    setCostCentres(prev => prev.map(cc => cc.id === id ? { ...cc, is_active: !isActive } : cc))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cost centre?')) return
    await supabase.from('cost_centres').delete().eq('id', id)
    setCostCentres(prev => prev.filter(cc => cc.id !== id))
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '700px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Cost Centres</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Manage cost centres used for expense allocation</p>
        </div>
        <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', padding: '8px 14px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
            {['Name / Code', 'Status', '', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : costCentres.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No cost centres yet. Add one below.</div>
          ) : (
            costCentres.map(cc => <CostCentreRow key={cc.id} cc={cc} onToggle={handleToggle} onDelete={handleDelete} />)
          )}
          <AddForm onAdd={handleAdd} />
        </div>
      </div>
    </AppShell>
  )
}
