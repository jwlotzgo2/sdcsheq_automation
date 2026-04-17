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

const ROLES = ['AP_CLERK', 'REVIEWER', 'APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN', 'SUPPLIER']

const ROLE_META: Record<string, { color: string; bg: string; label: string; description: string }> = {
  AP_CLERK:        { color: MUTED,     bg: LIGHT,     label: 'AP Clerk',        description: 'Review invoices, assign GL codes' },
  REVIEWER:        { color: '#3B82F6', bg: '#EBF4FF', label: 'Reviewer',        description: 'Review and submit for approval' },
  APPROVER:        { color: OLIVE,     bg: '#F0FDF4', label: 'Approver',        description: 'Approve invoices, push to Xero' },
  FINANCE_MANAGER: { color: AMBER,     bg: '#FEF3C7', label: 'Finance Manager', description: 'Full pipeline visibility' },
  AP_ADMIN:        { color: '#8B5CF6', bg: '#F5F3FF', label: 'Admin',           description: 'Full access including user management' },
  SUPPLIER:        { color: '#13B5EA', bg: '#EBF9FF', label: 'Supplier',        description: 'Supplier portal access only' },
}

const initials = (name: string) =>
  name ? name.split(/[@.\s]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

const avatarColor = (name: string) => {
  const colors = ['#E8960C', '#5B6B2D', '#3B82F6', '#8B5CF6', '#0D7A6E', '#F97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

// ── External components — never re-created on parent state change ──

const UserCard = memo(function UserCard({ user, isSelected, onSelect }: {
  user: any; isSelected: boolean; onSelect: (u: any) => void
}) {
  const role  = ROLE_META[user.role] ?? { color: MUTED, bg: LIGHT, label: user.role ?? 'No role', description: '' }
  const color = avatarColor(user.email ?? '')
  return (
    <div onClick={() => onSelect(isSelected ? null : user)}
      style={{ padding: '12px 16px', borderBottom: `1px solid ${LIGHT}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: isSelected ? '#FEF3C7' : WHITE, borderLeft: isSelected ? `3px solid ${AMBER}` : '3px solid transparent' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = LIGHT }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = WHITE }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
        {initials(user.full_name || user.email || '?')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.full_name || user.email?.split('@')[0] || '—'}
        </div>
        <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
      </div>
      <span style={{ fontSize: '10px', fontWeight: '600', color: role.color, backgroundColor: role.bg, padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>
        {role.label}
      </span>
      {!user.is_active && <span style={{ fontSize: '10px', color: RED, fontWeight: '600', flexShrink: 0 }}>Inactive</span>}
    </div>
  )
})

const DetailPanel = memo(function DetailPanel({ user, isAdmin, saving, saveMsg, onRoleChange, onToggleActive, onToggleCapture, onNameSave, onSupplierLink, allSuppliers }: {
  user: any; isAdmin: boolean; saving: boolean; saveMsg: string
  onRoleChange: (userId: string, role: string) => void
  onToggleActive: (userId: string, isActive: boolean) => void
  onToggleCapture: (userId: string, current: boolean) => void
  onNameSave: (userId: string, name: string) => void
  onSupplierLink: (userId: string, supplierId: string) => void
  allSuppliers: any[]
}) {
  const [editName, setEditName] = useState(user?.full_name ?? '')

  useEffect(() => { setEditName(user?.full_name ?? '') }, [user?.user_id])

  if (!user) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '28px' }}>👤</div>
      <div>Select a user to view details</div>
    </div>
  )

  const role  = ROLE_META[user.role] ?? { color: MUTED, bg: LIGHT, label: user.role ?? 'No role', description: '' }
  const color = avatarColor(user.email ?? '')

  return (
    <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '18px', fontWeight: '700', flexShrink: 0 }}>
          {initials(user.full_name || user.email || '?')}
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: DARK }}>{user.full_name || user.email?.split('@')[0]}</div>
          <div style={{ fontSize: '12px', color: MUTED }}>{user.email}</div>
        </div>
      </div>

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        {[
          { label: 'Email',        value: user.email },
          { label: 'Joined',       value: fmtDate(user.created_at) },
          { label: 'Last updated', value: fmtDate(user.updated_at) },
          { label: 'Status',       value: user.is_active ? '✓ Active' : '✗ Inactive' },
        ].map(({ label, value }) => (
          <div key={label} style={{ backgroundColor: LIGHT, borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{label}</div>
            <div style={{ fontSize: '13px', fontWeight: '500', color: DARK }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Display name */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Display Name</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onNameSave(user.user_id, editName)}
            disabled={!isAdmin}
            placeholder="Full name..."
            style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', color: DARK, backgroundColor: isAdmin ? WHITE : LIGHT, outline: 'none' }}
          />
          {isAdmin && (
            <button onClick={() => onNameSave(user.user_id, editName)} disabled={saving}
              style={{ padding: '8px 14px', borderRadius: '7px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              Save
            </button>
          )}
        </div>
      </div>

      {/* Role */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Role</label>
        {isAdmin ? (
          <select value={user.role ?? ''} onChange={e => onRoleChange(user.user_id, e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', backgroundColor: WHITE, color: DARK }}>
            <option value="">— No role —</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r]?.label ?? r} — {ROLE_META[r]?.description}</option>)}
          </select>
        ) : (
          <span style={{ display: 'inline-block', backgroundColor: role.bg, borderRadius: '20px', padding: '5px 14px', fontSize: '13px', fontWeight: '600', color: role.color }}>
            {role.label}
          </span>
        )}
        {user.role && ROLE_META[user.role] && (
          <div style={{ fontSize: '11px', color: MUTED, marginTop: '5px' }}>{ROLE_META[user.role].description}</div>
        )}
      </div>

      {/* Active toggle */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: LIGHT, borderRadius: '8px', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>Account Active</div>
            <div style={{ fontSize: '11px', color: MUTED }}>Inactive users cannot sign in</div>
          </div>
          <button onClick={() => onToggleActive(user.user_id, user.is_active)} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: '20px', border: 'none', backgroundColor: user.is_active ? OLIVE : RED, color: WHITE, fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            {user.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      )}

      {/* Expense capture toggle */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: LIGHT, borderRadius: '8px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>Can Capture Expenses</div>
            <div style={{ fontSize: '11px', color: MUTED }}>Allow this user to submit expense receipts</div>
          </div>
          <button onClick={() => onToggleCapture(user.user_id, user.can_capture_expenses)} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: '20px', border: 'none', backgroundColor: user.can_capture_expenses ? '#13B5EA' : '#94A3B8', color: WHITE, fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            {user.can_capture_expenses ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      )}

      {/* Supplier link — only relevant for SUPPLIER role */}
      {isAdmin && user.role === 'SUPPLIER' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Linked Supplier</label>
          <select value={user.supplier_id ?? ''} onChange={e => onSupplierLink(user.user_id, e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1.5px solid ${BORDER}`, borderRadius: '7px', backgroundColor: WHITE, color: DARK }}>
            <option value="">— Not linked —</option>
            {allSuppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>Link this user to a supplier so they can access the supplier portal</div>
        </div>
      )}

      {saveMsg && <div style={{ fontSize: '12px', color: OLIVE, fontWeight: '600', textAlign: 'center', marginTop: '8px' }}>✓ {saveMsg}</div>}
    </div>
  )
})

// ── Main page ──────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]             = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [currentRole, setCurrentRole] = useState('')
  const [selected, setSelected]       = useState<any>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('REVIEWER')
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [showInvite, setShowInvite]   = useState(false)
  const [allSuppliers, setAllSuppliers] = useState<any[]>([])
  const isMobile = useIsMobile()
  const [mounted, setMounted]         = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase.from('user_profiles').select('role').eq('email', data.user.email).maybeSingle()
          .then(({ data: p }) => setCurrentRole(p?.role ?? ''))
      }
    })
    fetchUsers()
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name').then(({ data }) => setAllSuppliers(data ?? []))
  }, [])

  const isAdmin = currentRole === 'AP_ADMIN'

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('user_profiles').select('user_id, email, full_name, role, is_active, can_capture_expenses, supplier_id, created_at, updated_at').order('created_at')
    setUsers(data ?? [])
    setLoading(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail) return
    setInviting(true); setInviteMsg('')
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    const data = await res.json()
    if (data.success) {
      setInviteMsg(`✓ Invite sent to ${inviteEmail}`)
      setInviteEmail(''); setShowInvite(false)
      fetchUsers()
    } else {
      setInviteMsg(`Error: ${data.error}`)
    }
    setInviting(false)
  }

  const patchUser = async (userId: string, patch: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch(`/api/admin/users/${userId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }))
      setSaveMsg(`Error: ${data.error ?? 'Update failed'}`)
      setTimeout(() => setSaveMsg(''), 3000)
      return false
    }
    return true
  }

  const handleRoleChange = async (userId: string, role: string) => {
    setSaving(true)
    const ok = await patchUser(userId, { role })
    if (ok) {
      setSelected((prev: any) => prev ? { ...prev, role } : prev)
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role } : u))
      setSaveMsg('Role updated'); setTimeout(() => setSaveMsg(''), 2000)
    }
    setSaving(false)
  }

  const handleToggleCapture = async (userId: string, current: boolean) => {
    setSaving(true)
    const ok = await patchUser(userId, { can_capture_expenses: !current })
    if (ok) {
      setSelected((prev: any) => prev ? { ...prev, can_capture_expenses: !current } : prev)
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_capture_expenses: !current } : u))
    }
    setSaving(false)
  }

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    setSaving(true)
    const ok = await patchUser(userId, { is_active: !isActive })
    if (ok) {
      setSelected((prev: any) => prev ? { ...prev, is_active: !isActive } : prev)
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_active: !isActive } : u))
    }
    setSaving(false)
  }

  const handleSupplierLink = async (userId: string, supplierId: string) => {
    setSaving(true)
    const ok = await patchUser(userId, { supplier_id: supplierId || null })
    if (ok) {
      setSelected((prev: any) => prev ? { ...prev, supplier_id: supplierId || null } : prev)
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, supplier_id: supplierId || null } : u))
      setSaveMsg('Supplier linked'); setTimeout(() => setSaveMsg(''), 2000)
    }
    setSaving(false)
  }

  const handleNameSave = async (userId: string, fullName: string) => {
    setSaving(true)
    await supabase.from('user_profiles').update({ full_name: fullName }).eq('user_id', userId)
    setSelected((prev: any) => prev ? { ...prev, full_name: fullName } : prev)
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, full_name: fullName } : u))
    setSaveMsg('Name updated'); setTimeout(() => setSaveMsg(''), 2000)
    setSaving(false)
  }

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)

  if (!mounted) return null

  return (
    <AppShell>
      <div style={{ maxWidth: '900px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Users</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>{activeUsers.length} active · {inactiveUsers.length} inactive</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {inviteMsg && <span style={{ fontSize: '12px', color: OLIVE, fontWeight: '600' }}>{inviteMsg}</span>}
            {isAdmin && (
              <button onClick={() => setShowInvite(true)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                + Invite User
              </button>
            )}
          </div>
        </div>

        {/* Main layout */}
        <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0 }}>
          {/* User list */}
          <div style={{ width: isMobile ? '100%' : '340px', flexShrink: 0, backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active ({activeUsers.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
              ) : (
                <>
                  {activeUsers.map(u => (
                    <UserCard key={u.user_id} user={u} isSelected={selected?.user_id === u.user_id} onSelect={setSelected} />
                  ))}
                  {inactiveUsers.length > 0 && (
                    <>
                      <div style={{ padding: '8px 14px', fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: LIGHT, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                        Inactive ({inactiveUsers.length})
                      </div>
                      {inactiveUsers.map(u => (
                        <UserCard key={u.user_id} user={u} isSelected={selected?.user_id === u.user_id} onSelect={setSelected} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Detail panel — desktop */}
          {!isMobile && (
            <div style={{ flex: 1, backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                User Detail
              </div>
              <DetailPanel
                user={selected} isAdmin={isAdmin} saving={saving} saveMsg={saveMsg}
                onRoleChange={handleRoleChange} onToggleActive={handleToggleActive} onToggleCapture={handleToggleCapture} onNameSave={handleNameSave} onSupplierLink={handleSupplierLink} allSuppliers={allSuppliers}
              />
            </div>
          )}
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#F5F5F2', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: DARK, margin: 0 }}>Invite User</h2>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Email address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                placeholder="user@sdcsheq.co.za"
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: DARK, backgroundColor: WHITE }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '5px' }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', backgroundColor: WHITE, color: DARK }}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r]?.label ?? r} — {ROLE_META[r]?.description}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowInvite(false)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail}
                style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: inviting || !inviteEmail ? '#C8B89A' : AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                {inviting ? 'Sending...' : 'Send Invite →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile detail sheet */}
      {isMobile && selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', backgroundColor: WHITE, borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: BORDER, borderRadius: '2px', margin: '12px auto 4px' }} />
            <DetailPanel
              user={selected} isAdmin={isAdmin} saving={saving} saveMsg={saveMsg}
              onRoleChange={handleRoleChange} onToggleActive={handleToggleActive} onToggleCapture={handleToggleCapture} onNameSave={handleNameSave} onSupplierLink={handleSupplierLink} allSuppliers={allSuppliers}
            />
          </div>
        </div>
      )}
    </AppShell>
  )
}
