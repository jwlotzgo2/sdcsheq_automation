import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

type Action = 'submit' | 'reject' | 'approve' | 'return' | 'recall'

type LineEdit = {
  id: string
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  line_total?: number | null
  gl_code_id?: string | null
}

type Body = {
  action: Action
  notes?: string
  supplier_id?: string | null
  lines?: LineEdit[]
}

// Action → required minimum role + state transition
const ACTION_CONFIG: Record<Action, {
  minRole: 'AP_CLERK' | 'APPROVER' | 'FINANCE_MANAGER' | 'AP_ADMIN'
  toStatus: string
  allowedFrom: string[]
  requiresNote: boolean
}> = {
  submit:  { minRole: 'AP_CLERK', toStatus: 'PENDING_APPROVAL', allowedFrom: ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED'], requiresNote: false },
  reject:  { minRole: 'AP_CLERK', toStatus: 'REJECTED',         allowedFrom: ['PENDING_REVIEW', 'IN_REVIEW', 'RETURNED', 'PENDING_APPROVAL'], requiresNote: true },
  approve: { minRole: 'APPROVER', toStatus: 'APPROVED',         allowedFrom: ['PENDING_APPROVAL'], requiresNote: false },
  return:  { minRole: 'APPROVER', toStatus: 'RETURNED',         allowedFrom: ['PENDING_APPROVAL'], requiresNote: true },
  recall:  { minRole: 'AP_CLERK', toStatus: 'IN_REVIEW',        allowedFrom: ['PENDING_APPROVAL', 'APPROVED'], requiresNote: false },
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const cfg = ACTION_CONFIG[body.action]
  if (!cfg) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const gate = await requireRole(request, cfg.minRole)
  if (!gate.ok) return gate.response

  if (cfg.requiresNote && !body.notes?.trim()) {
    return NextResponse.json({ error: `Notes are required for ${body.action}` }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Load current invoice + lines so we can diff
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, status, supplier_id, supplier_name, notes')
    .eq('id', params.id)
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (!cfg.allowedFrom.includes(invoice.status)) {
    return NextResponse.json(
      { error: `Cannot ${body.action} an invoice in status ${invoice.status}` },
      { status: 409 },
    )
  }

  const { data: existingLines } = await supabase
    .from('invoice_line_items')
    .select('id, description, quantity, unit_price, line_total, gl_code_id')
    .eq('invoice_id', params.id)

  const beforeById = new Map((existingLines ?? []).map(l => [l.id, l]))

  // ── Apply line edits (submit / approve actions can both update lines) ──
  const lineChanges: any[] = []
  if (body.lines && body.lines.length > 0) {
    for (const edit of body.lines) {
      const before = beforeById.get(edit.id)
      if (!before) continue

      const patch: any = {}
      const diff: any = {}

      const maybeNumber = (v: any) => v == null || v === '' ? null : Number(v)
      const norm = {
        description: edit.description ?? before.description,
        quantity:    edit.quantity    !== undefined ? maybeNumber(edit.quantity)    : before.quantity,
        unit_price:  edit.unit_price  !== undefined ? maybeNumber(edit.unit_price)  : before.unit_price,
        line_total:  edit.line_total  !== undefined ? maybeNumber(edit.line_total)  : before.line_total,
        gl_code_id:  edit.gl_code_id  !== undefined ? edit.gl_code_id               : before.gl_code_id,
      }

      for (const k of ['description', 'quantity', 'unit_price', 'line_total', 'gl_code_id'] as const) {
        if ((norm as any)[k] !== (before as any)[k]) {
          patch[k] = (norm as any)[k]
          diff[k] = { from: (before as any)[k], to: (norm as any)[k] }
        }
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from('invoice_line_items')
          .update(patch)
          .eq('id', edit.id)
        if (error) {
          return NextResponse.json({ error: `Line update failed: ${error.message}` }, { status: 500 })
        }
        lineChanges.push({ line_id: edit.id, description: norm.description, changes: diff })
      }
    }
  }

  // ── Update invoice ──
  const invoicePatch: any = { status: cfg.toStatus }
  const invoiceDiff: any = { status: { from: invoice.status, to: cfg.toStatus } }

  if (body.action === 'submit' && body.supplier_id !== undefined) {
    const newSupplierId = body.supplier_id || null
    if (newSupplierId !== invoice.supplier_id) {
      invoicePatch.supplier_id = newSupplierId
      invoiceDiff.supplier_id = { from: invoice.supplier_id, to: newSupplierId }
    }
  }
  if (body.action === 'submit' && body.notes?.trim()) {
    invoicePatch.notes = body.notes.trim()
  }
  if (body.action === 'reject') {
    invoicePatch.rejection_reason = body.notes?.trim() ?? null
  }

  const { error: updErr } = await supabase
    .from('invoices')
    .update(invoicePatch)
    .eq('id', params.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // ── Build human-readable audit note ──
  const summary: string[] = []
  if (lineChanges.length > 0) summary.push(`${lineChanges.length} line${lineChanges.length === 1 ? '' : 's'} edited`)
  if (invoiceDiff.supplier_id) summary.push('supplier changed')
  if (body.notes?.trim()) summary.push(`note: "${body.notes.trim()}"`)

  const actionLabels: Record<Action, string> = {
    submit:  'Submitted for approval',
    reject:  'Rejected',
    approve: 'Approved',
    return:  'Returned to reviewer',
    recall:  'Recalled by reviewer for editing',
  }

  const noteText = summary.length > 0
    ? `${actionLabels[body.action]} — ${summary.join('; ')}`
    : actionLabels[body.action]

  // ── Insert audit entry (service role — bypasses RLS) ──
  const { error: auditErr } = await supabase.from('audit_trail').insert({
    invoice_id:  params.id,
    from_status: invoice.status,
    to_status:   cfg.toStatus,
    actor_id:    gate.user.id,
    actor_email: gate.user.email,
    notes:       noteText,
    metadata: {
      action: body.action,
      role:   gate.profile.role,
      invoice_changes: Object.keys(invoiceDiff).length > 1 ? invoiceDiff : undefined,
      line_changes:    lineChanges.length > 0 ? lineChanges : undefined,
      lines_edited_count: lineChanges.length,
      free_text_note: body.notes?.trim() || undefined,
    },
  })

  if (auditErr) {
    console.error('[invoices/transition] audit insert failed', auditErr.message)
  }

  console.log(`[invoices/transition] ${gate.user.email} ${body.action} ${params.id} → ${cfg.toStatus} (${lineChanges.length} line edits)`)

  return NextResponse.json({
    success: true,
    status: cfg.toStatus,
    line_changes: lineChanges.length,
  })
}
