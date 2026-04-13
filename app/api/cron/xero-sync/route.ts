import { NextRequest, NextResponse } from 'next/server'
import { syncPaymentStatus } from '@/lib/xero/sync'
import { syncGlCodes, syncSuppliers } from '@/lib/xero/client'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expected = `Bearer ${cronSecret}`
  const headerBuf = Buffer.from(authHeader)
  const expectedBuf = Buffer.from(expected)
  if (headerBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(headerBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[cron/xero-sync] Starting daily Xero sync...')

    // Run all three in parallel
    const [paymentResult, glCount, supplierCount] = await Promise.allSettled([
      syncPaymentStatus(),
      syncGlCodes(),
      syncSuppliers(),
    ])

    const payments = paymentResult.status === 'fulfilled' ? paymentResult.value : { error: (paymentResult as any).reason?.message }
    const gl       = glCount.status === 'fulfilled' ? glCount.value : 0
    const suppliers = supplierCount.status === 'fulfilled' ? supplierCount.value : 0

    // Update last_sync_at on xero_settings
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await supabase.from('xero_settings').update({
      last_sync_at: new Date().toISOString(),
    }).eq('id', '00000000-0000-0000-0000-000000000001')

    console.log(`[cron/xero-sync] ✓ Complete — GL: ${gl}, Suppliers: ${suppliers}, Payments: ${JSON.stringify(payments)}`)

    return NextResponse.json({
      success: true,
      gl_codes_synced: gl,
      suppliers_synced: suppliers,
      payments,
    })
  } catch (err: any) {
    console.error('[cron/xero-sync] Error:', err.message)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
