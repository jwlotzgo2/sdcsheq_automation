import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/require-role'

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, 'AP_ADMIN')
  if (!gate.ok) return gate.response

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN
  if (!postmarkToken) return NextResponse.json({ error: 'POSTMARK_SERVER_TOKEN not configured' }, { status: 500 })

  try {
    // Fetch all statuses in parallel
    const statuses = ['processed', 'failed', 'scheduled', 'queued', 'blocked']
    const results = await Promise.all(
      statuses.map(status =>
        fetch(`https://api.postmarkapp.com/messages/inbound?count=500&offset=0&status=${status}`, {
          headers: {
            'Accept': 'application/json',
            'X-Postmark-Server-Token': postmarkToken,
          },
        }).then(r => r.ok ? r.json() : { InboundMessages: [] })
          .catch(() => ({ InboundMessages: [] }))
      )
    )

    // Deduplicate by MessageID, track retry counts, prefer worst status
    const statusPriority: Record<string, number> = { failed: 4, blocked: 3, scheduled: 2, queued: 1, processed: 0 }
    const msgMap: Record<string, any> = {}

    for (let i = 0; i < statuses.length; i++) {
      const msgs = results[i].InboundMessages ?? []
      for (const m of msgs) {
        const id = m.MessageID
        const status = (m.Status ?? statuses[i]).toLowerCase()
        if (!msgMap[id]) {
          msgMap[id] = {
            messageId: id,
            from: m.From,
            fromName: m.FromName,
            to: m.To,
            subject: m.Subject,
            date: m.Date,
            status: status,
            retryCount: 0,
            attachments: (m.Attachments ?? []).map((a: any) => ({
              name: a.Name,
              contentType: a.ContentType,
              contentLength: a.ContentLength,
            })),
          }
        }
        // Count retries (each entry for same ID = one attempt)
        if (status === 'scheduled' || status === 'failed') {
          msgMap[id].retryCount++
        }
        // Keep the worst status
        if ((statusPriority[status] ?? 0) > (statusPriority[msgMap[id].status] ?? 0)) {
          msgMap[id].status = status
        }
      }
    }

    const allMessages = Object.values(msgMap)
    allMessages.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ messages: allMessages, totalCount: allMessages.length })
  } catch (err: any) {
    console.error('[postmark-activity]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
