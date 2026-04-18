// app/api/recon/config/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { ProposedStatementConfig } from '@/lib/types/statement'
import { requireRole } from '@/lib/auth/require-role'

const anthropic = new Anthropic()

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ANALYSE_PROMPT = `You are analysing a supplier statement PDF to understand its layout.

Your job is NOT to extract all the data. Your job is to understand HOW this statement is structured
so that future extractions can be done accurately.

Study the statement carefully and return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "date_format": "DD/MM/YYYY",
  "reference_column_hint": "The exact column heading or label used for invoice/document references, e.g. 'Reference', 'Invoice No', 'Doc Number'. Null if not labelled.",
  "reference_pattern": "A regex pattern describing the reference format, e.g. 'INV-[0-9]+' or '[0-9]{6}'. Null if variable.",
  "debit_label": "The exact column heading used for amounts the supplier charges, e.g. 'Debit', 'Charges', 'Amount'. Null if not labelled.",
  "credit_label": "The exact column heading used for payments or credits, e.g. 'Credit', 'Payments'. Null if not labelled.",
  "payment_identifier": "A phrase or pattern used to identify payment rows in the description column, e.g. 'Payment received - thank you', 'EFT Payment'. Null if unclear.",
  "opening_balance_label": "The exact label used for the opening balance row, e.g. 'Opening Balance', 'Balance B/F'. Null if not present.",
  "closing_balance_label": "The exact label used for the closing balance or amount due, e.g. 'Amount Due', 'Closing Balance', 'Total Outstanding'. Null if not present.",
  "layout_notes": "A plain English description of the statement layout in 3-5 sentences. Describe the column order, how invoices vs payments vs credits are distinguished, any special formatting, and any quirks that would help future extraction.",
  "sample_lines": [
    {
      "line_date": "YYYY-MM-DD or null",
      "reference": "the reference as printed",
      "description": "the description as printed",
      "debit_amount": number_or_null,
      "credit_amount": number_or_null,
      "running_balance": number_or_null,
      "line_type": "INVOICE or CREDIT_NOTE or PAYMENT or UNKNOWN"
    }
  ]
}

For sample_lines: extract the first 5 transaction lines from the statement body (skip header, opening balance, and closing balance rows).
These are used to verify the config is correct.

Rules:
- date_format must be one of: "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY", "DD MMM YYYY"
- All amounts must be positive numbers. Use debit_amount for charges, credit_amount for payments/credits.
- line_type: INVOICE = supplier charging us, CREDIT_NOTE = supplier crediting us, PAYMENT = we paid them
- Return null for any field you cannot determine with confidence.`

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, 'AP_CLERK')
  if (!gate.ok) return gate.response

  try {
    const body = await req.json()
    const { storage_path } = body as { storage_path: string }

    if (!storage_path) {
      return NextResponse.json({ error: 'storage_path required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('invoices')
      .download(storage_path)

    if (downloadError || !fileData) {
      console.error('[analyse] Download error:', downloadError)
      return NextResponse.json({ error: 'Failed to download PDF' }, { status: 500 })
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: ANALYSE_PROMPT,
            },
          ],
        },
      ],
    })

    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let proposed: ProposedStatementConfig
    try {
      proposed = JSON.parse(cleaned)
    } catch {
      console.error('[analyse] Failed to parse Claude response:', rawText)
      return NextResponse.json(
        { error: 'Claude returned invalid JSON. Try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ proposed })
  } catch (err) {
    console.error('[analyse] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
