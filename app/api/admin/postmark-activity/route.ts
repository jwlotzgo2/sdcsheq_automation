import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  // Auth check
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return request.cookies.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN
  if (!postmarkToken) return NextResponse.json({ error: 'POSTMARK_SERVER_TOKEN not configured' }, { status: 500 })

  try {
    // Fetch inbound messages from Postmark (last 100)
    const res = await fetch('https://api.postmarkapp.com/messages/inbound?count=100&offset=0', {
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Server-Token': postmarkToken,
      },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[postmark-activity] API error:', err)
      return NextResponse.json({ error: `Postmark API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const messages = (data.InboundMessages ?? []).map((m: any) => ({
      messageId: m.MessageID,
      from: m.From,
      fromName: m.FromName,
      to: m.To,
      subject: m.Subject,
      date: m.Date,
      status: m.Status,
      attachments: (m.Attachments ?? []).map((a: any) => ({
        name: a.Name,
        contentType: a.ContentType,
        contentLength: a.ContentLength,
      })),
    }))

    return NextResponse.json({ messages, totalCount: data.TotalCount ?? messages.length })
  } catch (err: any) {
    console.error('[postmark-activity]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
