'use client'

import { useEffect, useState } from 'react'
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

const ROLES = ['AP_CLERK', 'REVIEWER', 'APPROVER', 'FINANCE_MANAGER', 'AP_ADMIN']

const ROLE_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  AP_CLERK:        { color: MUTED,     bg: LIGHT,      label: 'AP Clerk' },
  REVIEWER:        { color: '#3B82F6', bg: '#EBF4FF',  label: 'Reviewer' },
  APPROVER:        { color: OLIVE,     bg: '#F0FDF4',  label: 'Approver' },
  FINANCE_MANAGER: { color: AMBER,     bg: '#FEF3C7',  label: 'Finance Manager' },
  AP_ADMIN:        { color: '#8B5CF6', bg: '#F5F3FF',  label: 'Admin' },
}

const initials = (name: string) =>
  name ? name.split(/[@.\s]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

const avatarColor = (name: string) => {
  const colors = ['#E8960C', '#5B6B2D', '#3B82F6', '#8B5CF6', '#0D7A6E', '#F97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}



function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export default function UsersPage() {
  const isMobile = useIsMobile()
  const [users, setUsers]           = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('REVIEWER')
  const [inviting, setInviting]     = useState(false)
  const [inviteMsg, setInviteMsg]   = useState('')
  const [savingRole, setSavingRole] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at')
    setUsers(data ?? [])
    setLoading(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail) return
    setInviting(true)
    setInviteMsg('')

    // Send magic link via Supabase Admin — we use the API route
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    const data = await res.json()

    if (data.error) {
      setInviteMsg(`✗ ${data.error}`)
    } else {
      setInviteMsg(`✓ Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      fetchUsers()
    }
    setInviting(false)
  }

  const updateRole = async (userId: string, role: string) => {
    setSavingRole(userId)
    await supabase.from('user_profiles').update({ role }).eq('user_id', userId)
    await fetchUsers()
    setSavingRole(null)
  }

  const toggleActive = async (userId: string, isActive: boolean) => {
    await supabase.from('user_profiles').update({ is_active: !isActive }).eq('user_id', userId)
    fetchUsers()
  }

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)

  return (
    <AppShell>
      <div style={{ maxWidth: '900px', padding: isMobile ? '0' : undefined }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>User Management</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>{activeUsers.length} active user{activeUsers.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setShowInvite(true); setInviteMsg('') }}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: AMBER, color: WHITE, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            + Invite User
          </button>
        </div>

        {/* Role legend */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {Object.entries(ROLE_STYLES).map(([role, style]) => (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', backgroundColor: style.bg, border: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: style.color }}>{style.label}</span>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: LIGHT }}>
            Active Users
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '36px 1fr 120px' : '36px 1fr 180px 160px 80px', padding: '10px 16px', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` }}>
            {(isMobile ? ['', 'User', 'Role'] : ['', 'User', 'Role', 'Last Sign In', '']).map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
          ) : activeUsers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No active users.</div>
          ) : (
            activeUsers.map((user, i) => {
              const roleStyle = ROLE_STYLES[user.role] ?? ROLE_STYLES['AP_CLERK']
              const color     = avatarColor(user.email)
              const name      = user.full_name || user.email
              return (
                <div key={user.id} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '36px 1fr 120px' : '36px 1fr 180px 160px 80px',
                  padding: '14px 20px', borderBottom: i < activeUsers.length - 1 ? `1px solid ${LIGHT}` : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '10px', fontWeight: '700' }}>
                    {initials(name)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{user.full_name || '—'}</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{user.email}</div>
                  </div>
                  <div>
                    <select
                      value={user.role}
                      onChange={e => updateRole(user.user_id, e.target.value)}
                      disabled={savingRole === user.user_id}
                      style={{
                        padding: '5px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                        border: `1.5px solid ${BORDER}`, backgroundColor: roleStyle.bg,
                        color: roleStyle.color, cursor: 'pointer', outline: 'none',
                      }}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_STYLES[r]?.label ?? r}</option>
                      ))}
                    </select>
                  </div>
                  {!isMobile && <div style={{ fontSize: '11px', color: MUTED }}>{user.updated_at ? new Date(user.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>}
                  {!isMobile && <div><button onClick={() => toggleActive(user.user_id, user.is_active)} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '11px', cursor: 'pointer' }}>Deactivate</button></div>}
                </div>
              )
            })
          )}
        </div>

        {/* Inactive users */}
        {inactiveUsers.length > 0 && (
          <div style={{ backgroundColor: WHITE, borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: LIGHT }}>
              Inactive Users
            </div>
            {inactiveUsers.map((user, i) => (
              <div key={user.id} style={{
                display: 'grid', gridTemplateColumns: '36px 1fr 180px 80px',
                padding: '12px 20px', borderBottom: i < inactiveUsers.length - 1 ? `1px solid ${LIGHT}` : 'none',
                alignItems: 'center', opacity: 0.6,
              }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: '10px', fontWeight: '700' }}>
                  {initials(user.email)}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: DARK }}>{user.full_name || '—'}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{user.email}</div>
                </div>
                <div style={{ fontSize: '11px', color: MUTED }}>{ROLE_STYLES[user.role]?.label ?? user.role}</div>
                <button
                  onClick={() => toggleActive(user.user_id, user.is_active)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${OLIVE}`, backgroundColor: WHITE, color: OLIVE, fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div onClick={() => !inviting && setShowInvite(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: WHITE, borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: DARK, margin: 0 }}>Invite User</h2>
              {!inviting && <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: MUTED, cursor: 'pointer' }}>×</button>}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                placeholder="user@sdcsheq.co.za"
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', boxSizing: 'border-box', color: DARK, outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: DARK, marginBottom: '6px' }}>Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1.5px solid ${BORDER}`, borderRadius: '8px', color: DARK, backgroundColor: WHITE }}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_STYLES[r]?.label ?? r}</option>
                ))}
              </select>
            </div>

            {inviteMsg && (
              <div style={{ padding: '10px 12px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px', backgroundColor: inviteMsg.startsWith('✓') ? '#DCFCE7' : '#FEE2E2', color: inviteMsg.startsWith('✓') ? OLIVE : RED }}>
                {inviteMsg}
              </div>
            )}

            <div style={{ backgroundColor: LIGHT, borderRadius: '7px', padding: '12px', marginBottom: '20px', fontSize: '12px', color: MUTED, lineHeight: 1.6 }}>
              The user will receive a magic link email to sign in. Their role will be set to <strong style={{ color: DARK }}>{ROLE_STYLES[inviteRole]?.label}</strong> automatically on first login.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowInvite(false)} disabled={inviting} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: MUTED, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail} style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: inviting || !inviteEmail ? '#94A3B8' : AMBER, color: WHITE, fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
