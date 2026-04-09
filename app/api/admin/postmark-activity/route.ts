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
    // Fetch all statuses in parallel: processed, failed, scheduled (retry), queued, blocked
    const statuses = ['processed', 'failed', 'scheduled', 'queued', 'blocked']
    const results = await Promise.all(
      statuses.map(status =>
        fetch(`https://api.postmarkapp.com/messages/inbound?count=100&offset=0&status=${status}`, {
          headers: {
            'Accept': 'application/json',
            'X-Postmark-Server-Token': postmarkToken,
          },
        }).then(r => r.ok ? r.json() : { InboundMessages: [] })
          .catch(() => ({ InboundMessages: [] }))
      )
    )

    // Merge all messages
    const allMessages: any[] = []
    const seenIds = new Set<string>()

    for (let i = 0; i < statuses.length; i++) {
      const msgs = results[i].InboundMessages ?? []
      for (const m of msgs) {
        if (!seenIds.has(m.MessageID)) {
          seenIds.add(m.MessageID)
          allMessages.push({
            messageId: m.MessageID,
            from: m.From,
            fromName: m.FromName,
            to: m.To,
            subject: m.Subject,
            date: m.Date,
            status: m.Status ?? statuses[i],
            attachments: (m.Attachments ?? []).map((a: any) => ({
              name: a.Name,
              contentType: a.ContentType,
              contentLength: a.ContentLength,
            })),
          })
        }
      }
    }

    // Sort by date descending
    allMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ messages: allMessages, totalCount: allMessages.length })
  } catch (err: any) {
    console.error('[postmark-activity]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
