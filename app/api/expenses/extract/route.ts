import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Convert to base64
    const buffer   = await file.arrayBuffer()
    const base64   = Buffer.from(buffer).toString('base64')
    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'

    const isImage = mimeType.startsWith('image/')
    const isPdf   = mimeType === 'application/pdf'

    if (!isImage && !isPdf) {
      return NextResponse.json({ error: 'Only images and PDFs are supported' }, { status: 400 })
    }

    const content: any[] = []

    if (isImage) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } })
    } else {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
    }

    content.push({
      type: 'text',
      text: `Extract expense receipt data and return ONLY valid JSON, no markdown:
{
  "vendor_name": "string or null",
  "receipt_date": "YYYY-MM-DD or null",
  "amount_excl": number or null,
  "amount_vat": number or null,
  "amount_incl": number or null
}
IMPORTANT: The receipt is being submitted by an employee of SDC Health And Safety (Pty) Ltd. SDC Health And Safety is the BUYER. The vendor/supplier is whoever issued this receipt.
Return amounts as numbers without currency symbols or commas.`
    })

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    })

    const text    = response.content.find(c => c.type === 'text')?.text ?? '{}'
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed  = JSON.parse(cleaned)

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('[expense-extract]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
