'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

const AMBER  = '#E8960C'
const DARK   = '#2A2A2A'
const OLIVE  = '#5B6B2D'
const BORDER = '#E2E0D8'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const WHITE  = '#FFFFFF'
const TEAL   = '#13B5EA'
const PURPLE = '#8B5CF6'
const RED    = '#EF4444'

const fmtDate = (val: any) =>
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtDT = (val: any) =>
  val ? new Date(val).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const timeAgo = (val: any) => {
  if (!val) return 'Never'
  const diff = Date.now() - new Date(val).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return fmtDate(val)
}

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

const ROLE_COLORS: Record<string, string> = {
  AP_ADMIN: PURPLE, AP_CLERK: MUTED, REVIEWER: '#3B82F6',
  APPROVER: OLIVE, FINANCE_MANAGER: AMBER, SUPPLIER: TEAL,
}
const ROLE_LABELS: Record<string, string> = {
  AP_ADMIN: 'Admin', AP_CLERK: 'AP Clerk', REVIEWER: 'Reviewer',
  APPROVER: 'Approver', FINANCE_MANAGER: 'Finance Manager', SUPPLIER: 'Supplier',
}

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  INGESTED:          { label: 'Invoice received',     color: '#64748B', icon: '📧' },
  EXTRACTING:        { label: 'Extracting invoice',   color: PURPLE,    icon: '🤖' },
  EXTRACTION_FAILED: { label: 'Extraction failed',    color: RED,       icon: '❌' },
  PENDING_REVIEW:    { label: 'Submitted for review', color: AMBER,     icon: '📋' },
  IN_REVIEW:         { label: 'Review started',       color: '#3B82F6', icon: '👁' },
  PENDING_APPROVAL:  { label: 'Submitted for approval', color: PURPLE,  icon: '✅' },
  APPROVED:          { label: 'Invoice approved',     color: OLIVE,     icon: '✓' },
  REJECTED:          { label: 'Invoice rejected',     color: RED,       icon: '✗' },
  RETURNED:          { label: 'Returned to reviewer', color: AMBER,     icon: '↩' },
  XERO_POSTED:       { label: 'Posted to Xero',       color: TEAL,      icon: '📤' },
  XERO_PAID:         { label: 'Marked as paid',       color: OLIVE,     icon: '💰' },
  PUSHING_TO_XERO:   { label: 'Pushing to Xero',      color: TEAL,      icon: '⟳' },
}

export default function AdminPage() {
  const [users, setUsers]             = useState<any[]>([])
  const [authUsers, setAuthUsers]     = useState<any[]>([])
  const [stats, setStats]             = useState<any>({})
  const [journal, setJournal]         = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [xeroSettings, setXeroSettings] = useState<any>(null)
  const router  = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('email', user.email).maybeSingle()
      if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? '')) { router.push('/'); return }

      const [{ data: userList }, { data: xero }, { data: auditData }] = await Promise.all([
        supabase.from('user_profiles').select('user_id, email, full_name, role, is_active, can_capture_expenses, created_at').order('created_at'),
        supabase.from('xero_settings').select('last_sync_at, tenant_name').limit(1).maybeSingle(),
        supabase.from('audit_trail')
          .select('id, invoice_id, from_status, to_status, actor_email, notes, created_at, invoices(supplier_name, invoice_number)')
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      setUsers(userList ?? [])
      setXeroSettings(xero)
      setJournal(auditData ?? [])

      // Fetch last login via API route
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch('/api/admin/users-activity', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
          .then(r => r.json())
          .then(d => { if (d.users) setAuthUsers(d.users) })
          .catch(() => {})
      }

      // Count queries in parallel
      const [{ count: totalC }, { count: reviewC }, { count: approvalC },
             { count: approvedC }, { count: xeroC }, { count: paidC }, { count: expenseC }] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).not('status', 'in', '("REJECTED")'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['PENDING_REVIEW','IN_REVIEW','RETURNED']),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['XERO_POSTED','XERO_AUTHORISED']),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'XERO_PAID'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('record_type', 'EXPENSE'),
      ])
      setStats({
        totalInvoices: totalC ?? 0, pendingReview: reviewC ?? 0,
        pendingApproval: approvalC ?? 0, approved: approvedC ?? 0,
        xeroPosted: xeroC ?? 0, paid: paidC ?? 0, expenses: expenseC ?? 0,
        activeUsers: (userList ?? []).filter((u:any) => u.is_active).length,
      })
      setLoading(false)
    }
    load()
  }, [])

  const getLastLogin = (email: string) => {
    const u = authUsers.find(u => u.email === email)
    return u?.last_sign_in ?? null
  }

  // Count actions per user from journal
  const userActivity = users.map(u => ({
    ...u,
    lastLogin:   getLastLogin(u.email),
    actionCount: journal.filter(j => j.actor_email === u.email).length,
    lastAction:  journal.find(j => j.actor_email === u.email)?.created_at ?? null,
  }))

  return (
    <AppShell>
      <div style={{ maxWidth: '1200px' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '12px', cursor: 'pointer', padding: '0 0 4px', display: 'block' }}>← Portals</button>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Admin Portal</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>System overview, user management, and configuration</p>
        </div>

        {/* KPI stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Total Invoices',   value: stats.totalInvoices,   color: DARK },
            { label: 'Pending Review',   value: stats.pendingReview,   color: AMBER },
            { label: 'Pending Approval', value: stats.pendingApproval, color: PURPLE },
            { label: 'Paid',             value: stats.paid,            color: OLIVE },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color }}>{loading ? '—' : value ?? 0}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Users',        href: '/admin/users',        icon: '👥', color: PURPLE },
            { label: 'Settings',     href: '/admin/settings',     icon: '⚙️', color: DARK },
            { label: 'Cost Centres', href: '/admin/cost-centres', icon: '🏷️', color: OLIVE },
            { label: 'Suppliers',    href: '/suppliers',          icon: '🏢', color: TEAL },
          ].map(({ label, href, icon, color }) => (
            <div key={href} onClick={() => router.push(href)}
              style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = LIGHT}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = WHITE}>
              <span style={{ fontSize: '20px' }}>{icon}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Main grid — 3 columns on desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 320px', gap: '16px' }}>

          {/* Users with activity */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: LIGHT }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Users & Activity
              </h2>
              <button onClick={() => router.push('/admin/users')}
                style={{ background: 'none', border: 'none', color: AMBER, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage →
              </button>
            </div>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
            ) : userActivity.filter(u => u.is_active).map((u, i, arr) => (
              <div key={u.user_id} style={{ padding: '12px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${LIGHT}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.full_name || u.email?.split('@')[0]}
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: ROLE_COLORS[u.role] ?? MUTED, backgroundColor: LIGHT, padding: '2px 8px', borderRadius: '10px', flexShrink: 0, marginLeft: '8px' }}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                  <div style={{ backgroundColor: LIGHT, borderRadius: '5px', padding: '4px 7px' }}>
                    <div style={{ fontSize: '9px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Last login</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{timeAgo(u.lastLogin)}</div>
                  </div>
                  <div style={{ backgroundColor: LIGHT, borderRadius: '5px', padding: '4px 7px' }}>
                    <div style={{ fontSize: '9px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Actions</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: u.actionCount > 0 ? OLIVE : MUTED }}>{u.actionCount}</div>
                  </div>
                  <div style={{ backgroundColor: LIGHT, borderRadius: '5px', padding: '4px 7px' }}>
                    <div style={{ fontSize: '9px', color: MUTED, fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Last active</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: DARK }}>{timeAgo(u.lastAction)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Activity journal */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, backgroundColor: LIGHT, flexShrink: 0 }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Activity Journal
              </h2>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>Last 50 actions across all invoices</div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: isMobile ? '400px' : '520px' }}>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
              ) : journal.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No activity yet</div>
              ) : journal.map((entry, i) => {
                const meta = ACTION_META[entry.to_status] ?? { label: entry.to_status, color: MUTED, icon: '·' }
                const inv  = entry.invoices
                return (
                  <div key={entry.id} style={{ padding: '10px 16px', borderBottom: i < journal.length - 1 ? `1px solid ${LIGHT}` : 'none', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {/* Icon */}
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: meta.color }}>{meta.label}</span>
                        <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>{timeAgo(entry.created_at)}</span>
                      </div>
                      {inv && (
                        <div style={{ fontSize: '11px', color: DARK, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inv.supplier_name ?? '—'} · {inv.invoice_number ?? '—'}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', color: MUTED }}>
                        {entry.actor_email?.split('@')[0]}
                        {entry.notes && ` · "${entry.notes.slice(0, 60)}${entry.notes.length > 60 ? '…' : ''}"`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Xero */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: '700', color: DARK, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Xero Connection</h2>
              {xeroSettings ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OLIVE }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: OLIVE }}>Connected</span>
                  </div>
                  <div style={{ fontSize: '12px', color: MUTED, marginBottom: '3px' }}>{xeroSettings.tenant_name ?? 'SDC SHEQ'}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>Last sync: {fmtDT(xeroSettings.last_sync_at)}</div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: RED }}>Not connected</div>
              )}
              <button onClick={() => router.push('/admin/settings')}
                style={{ marginTop: '12px', width: '100%', padding: '8px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage Connection
              </button>
            </div>

            {/* Pipeline */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: '700', color: DARK, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline</h2>
              {[
                { label: 'In Review',      value: stats.pendingReview,   color: AMBER },
                { label: 'In Approval',    value: stats.pendingApproval, color: PURPLE },
                { label: 'Ready for Xero', value: stats.approved,        color: OLIVE },
                { label: 'Xero Posted',    value: stats.xeroPosted,      color: TEAL },
                { label: 'Expenses',       value: stats.expenses,        color: '#F97316' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
                    <span style={{ fontSize: '12px', color: MUTED }}>{label}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color }}>{loading ? '—' : value ?? 0}</span>
                </div>
              ))}
            </div>

            {/* System */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: '700', color: DARK, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System</h2>
              {[
                { label: 'Active users',  value: stats.activeUsers ?? '—' },
                { label: 'Total journal', value: journal.length > 0 ? `${journal.length}+ entries` : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: MUTED }}>{label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: DARK }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
