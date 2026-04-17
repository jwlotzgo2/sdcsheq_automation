import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN
  if (!postmarkToken) return NextResponse.json({ error: 'POSTMARK_SERVER_TOKEN not configured' }, { status: 500 })

  const { messageId } = await request.json()
  if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 })

  try {
    const res = await fetch(`https://api.postmarkapp.com/messages/inbound/${messageId}/retry`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Server-Token': postmarkToken,
      },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[postmark-retry] Error:', err)
      return NextResponse.json({ error: `Postmark retry failed: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    console.log(`[postmark-retry] Retried message ${messageId}:`, data)
    return NextResponse.json({ success: true, ...data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
