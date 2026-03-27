import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic()

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Load live GL codes from DB
    const supabase = getSupabase()
    const { data: glCodes } = await supabase
      .from('gl_codes')
      .select('id, xero_account_code, name')
      .eq('is_active', true)
      .order('xero_account_code')

    const glList = (glCodes ?? [])
      .filter((g: any) => g.xero_account_code && g.name)
      .map((g: any) => `- ${g.xero_account_code}: ${g.name}`)
      .join('\n')

    // Convert file to base64
    const buffer   = await file.arrayBuffer()
    const base64   = Buffer.from(buffer).toString('base64')
    const mimeType = file.type as any

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
  "amount_incl": number or null,
  "suggested_gl_code": "account code string or null",
  "suggested_gl_name": "GL name string or null"
}

IMPORTANT:
- SDC Health And Safety (Pty) Ltd / SDC SHEQ is the BUYER — never identify them as the vendor. The vendor is whoever issued this receipt.
- Return amounts as numbers without currency symbols or commas.
- For suggested_gl_code, choose the most appropriate code from this list based on the vendor name and receipt content:
${glList}
- If you cannot confidently match a GL code, return null for both suggested_gl_code and suggested_gl_name.`
    })

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    })

    const text    = response.content.find((c: any) => c.type === 'text')?.text ?? '{}'
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed  = JSON.parse(cleaned)

    // Resolve GL code ID from account code
    if (parsed.suggested_gl_code && glCodes) {
      const match = glCodes.find((g: any) => g.xero_account_code === parsed.suggested_gl_code)
      if (match) parsed.suggested_gl_id = match.id
    }

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('[expense-extract]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
