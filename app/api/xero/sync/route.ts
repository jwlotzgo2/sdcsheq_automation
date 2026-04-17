import { NextRequest, NextResponse } from 'next/server'
import { syncGlCodes, syncSuppliers } from '@/lib/xero/client'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'FINANCE_MANAGER')
  if (!gate.ok) return gate.response

  try {
    const { type } = await request.json()

    let glCount = 0
    let supplierCount = 0

    if (type === 'gl' || type === 'both') {
      glCount = await syncGlCodes()
    }

    if (type === 'suppliers' || type === 'both') {
      supplierCount = await syncSuppliers()
    }

    const parts = []
    if (glCount > 0)       parts.push(`${glCount} GL codes`)
    if (supplierCount > 0) parts.push(`${supplierCount} suppliers`)

    return NextResponse.json({
      success: true,
      message: parts.length > 0 ? `Synced ${parts.join(' and ')} from Xero` : 'Nothing to sync',
      glCount,
      supplierCount,
    })
  } catch (err: any) {
    console.error('[xero/sync]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
