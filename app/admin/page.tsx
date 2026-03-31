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
  val ? new Date(val).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function useIsMobile() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const check = () => setV(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return v
}

export default function AdminPage() {
  const [users, setUsers]       = useState<any[]>([])
  const [stats, setStats]       = useState<any>({})
  const [loading, setLoading]   = useState(true)
  const [xeroSettings, setXeroSettings] = useState<any>(null)
  const router = useRouter()
  const isMobile = useIsMobile()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const load = async () => {
      // Verify admin role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('email', user.email).maybeSingle()
      if (!['AP_ADMIN', 'FINANCE_MANAGER'].includes(profile?.role ?? '')) { router.push('/'); return }

      const [{ data: userList }, { data: invoiceData }, { data: xero }] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at'),
        supabase.from('invoices').select('status, record_type', { count: 'exact' }).not('status', 'in', '("REJECTED")'),
        supabase.from('xero_settings').select('last_sync_at, tenant_name').limit(1).maybeSingle(),
      ])

      setUsers(userList ?? [])
      setXeroSettings(xero)

      // Run targeted count queries in parallel
      const [{ count: totalC }, { count: reviewC }, { count: approvalC }, { count: approvedC }, { count: xeroC }, { count: paidC }, { count: expenseC }] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).not('status', 'in', '("REJECTED")'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['PENDING_REVIEW','IN_REVIEW','RETURNED']),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['XERO_POSTED','XERO_AUTHORISED']),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'XERO_PAID'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('record_type', 'EXPENSE'),
      ])
      setStats({
        totalInvoices:   totalC ?? 0,
        pendingReview:   reviewC ?? 0,
        pendingApproval: approvalC ?? 0,
        approved:        approvedC ?? 0,
        xeroPosted:      xeroC ?? 0,
        paid:            paidC ?? 0,
        expenses:        expenseC ?? 0,
        activeUsers:     (userList ?? []).filter((u:any) => u.is_active).length,
        supplierUsers:   (userList ?? []).filter((u:any) => u.role === 'SUPPLIER').length,
      })
      setLoading(false)
    }
    load()
  }, [])

  const ROLE_COLORS: Record<string, string> = {
    AP_ADMIN: PURPLE, AP_CLERK: MUTED, REVIEWER: '#3B82F6',
    APPROVER: OLIVE, FINANCE_MANAGER: AMBER, SUPPLIER: TEAL,
  }
  const ROLE_LABELS: Record<string, string> = {
    AP_ADMIN: 'Admin', AP_CLERK: 'AP Clerk', REVIEWER: 'Reviewer',
    APPROVER: 'Approver', FINANCE_MANAGER: 'Finance Manager', SUPPLIER: 'Supplier',
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '1000px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Portals</button>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: DARK, margin: '0 0 4px' }}>Admin Portal</h1>
            <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>System overview, user management, and configuration</p>
          </div>
        </div>

        {/* Pipeline stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Total Invoices',    value: stats.totalInvoices,   color: DARK },
            { label: 'Pending Review',    value: stats.pendingReview,   color: AMBER },
            { label: 'Pending Approval',  value: stats.pendingApproval, color: PURPLE },
            { label: 'Paid',              value: stats.paid,            color: OLIVE },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '12px 14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color }}>{loading ? '—' : value ?? 0}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {[
            { label: 'Users',         href: '/admin/users',         icon: '👥', color: PURPLE },
            { label: 'Settings',      href: '/admin/settings',      icon: '⚙️', color: DARK },
            { label: 'Cost Centres',  href: '/admin/cost-centres',  icon: '🏷️', color: OLIVE },
            { label: 'Suppliers',     href: '/suppliers',           icon: '🏢', color: TEAL },
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

        {/* Two columns: users + xero status */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px' }}>

          {/* Users table */}
          <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: DARK, margin: 0 }}>
                Users ({loading ? '...' : stats.activeUsers} active)
              </h2>
              <button onClick={() => router.push('/admin/users')}
                style={{ background: 'none', border: 'none', color: AMBER, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage →
              </button>
            </div>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
            ) : (
              users.filter(u => u.is_active).map((u, i, arr) => (
                <div key={u.user_id} style={{ padding: '10px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${LIGHT}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: DARK }}>{u.full_name || u.email?.split('@')[0]}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{u.email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {u.can_capture_expenses && <span style={{ fontSize: '9px', color: TEAL, backgroundColor: '#EBF9FF', padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }}>CAPTURE</span>}
                    <span style={{ fontSize: '10px', fontWeight: '600', color: ROLE_COLORS[u.role] ?? MUTED, backgroundColor: LIGHT, padding: '2px 8px', borderRadius: '10px' }}>
                      {ROLE_LABELS[u.role] ?? u.role ?? 'No role'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: isMobile ? '100%' : '320px', flexShrink: 0 }}>

            {/* Xero status */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Xero Connection</h2>
              {xeroSettings ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OLIVE, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: OLIVE }}>Connected</span>
                  </div>
                  <div style={{ fontSize: '12px', color: MUTED, marginBottom: '4px' }}>{xeroSettings.tenant_name ?? 'SDC SHEQ'}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>Last sync: {fmtDate(xeroSettings.last_sync_at)}</div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: RED }}>Not connected</div>
              )}
              <button onClick={() => router.push('/admin/settings')}
                style={{ marginTop: '12px', width: '100%', padding: '8px', borderRadius: '7px', border: `1.5px solid ${BORDER}`, backgroundColor: WHITE, color: DARK, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Manage Connection
              </button>
            </div>

            {/* Pipeline summary */}
            <div style={{ backgroundColor: WHITE, borderRadius: '8px', border: `1px solid ${BORDER}`, padding: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: DARK, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline</h2>
              {[
                { label: 'In Review',       value: stats.pendingReview,   color: AMBER },
                { label: 'In Approval',     value: stats.pendingApproval, color: PURPLE },
                { label: 'Ready for Xero',  value: stats.approved,        color: OLIVE },
                { label: 'Xero Posted',     value: stats.xeroPosted,      color: TEAL },
                { label: 'Expenses',        value: stats.expenses,        color: '#F97316' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: MUTED }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color }}>{loading ? '—' : value ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
