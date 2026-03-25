import { NextRequest, NextResponse } from 'next/server'
import { syncPaymentStatus } from '@/lib/xero/sync'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[cron/xero-sync] Starting payment status sync...')
    const result = await syncPaymentStatus()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[cron/xero-sync] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
