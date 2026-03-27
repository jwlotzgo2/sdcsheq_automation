import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic()

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      },
    }
  )
}

const EXTRACTION_PROMPT = `You are an accounts payable assistant. Extract structured data from this invoice PDF.

Return ONLY a valid JSON object with this exact structure — no markdown, no explanation:

{
  "supplier_name": "string or null",
  "supplier_vat": "string or null",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "amount_excl": number or null,
  "amount_vat": number or null,
  "amount_incl": number or null,
  "currency": "ZAR",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit_price": number or null,
      "line_total": number or null,
      "vat_rate": number or null,
      "suggested_gl_code": "string or null",
      "suggested_gl_name": "string or null"
    }
  ],
  "confidence": {
    "supplier_name": 0.0-1.0,
    "invoice_number": 0.0-1.0,
    "invoice_date": 0.0-1.0,
    "amount_excl": 0.0-1.0,
    "amount_vat": 0.0-1.0,
    "amount_incl": 0.0-1.0,
    "line_items": 0.0-1.0
  },
  "overall_confidence": 0.0-1.0
}

For suggested_gl_code and suggested_gl_name, use these South African chart of accounts codes:
- 400: Advertising & Marketing
- 404: Bank Fees
- 408: Cleaning
- 412: Consulting & Accounting
- 416: Depreciation
- 420: Entertainment
- 424: Freight & Courier
- 425: General Expenses
- 429: IT & Software
- 433: Janitorial
- 437: Legal Expenses
- 441: Meals & Accommodation
- 445: Motor Vehicle Expenses
- 449: Office Expenses
- 453: Printing & Stationery
- 457: Repairs & Maintenance
- 461: Staff Training
- 465: Subscriptions
- 469: Telephone & Internet
- 473: Travel
- 477: Utilities
- 800: Cost of Goods Sold
- 810: Labour

Only assign a GL code if you are confident. Leave as null if uncertain.
Return amounts as numbers without currency symbols or commas.`

export async function extractInvoice(invoiceId: string): Promise<void> {
  const supabase = getSupabase()
  const startTime = Date.now()

  console.log(`[extract] Starting extraction for invoice: ${invoiceId}`)

  // 1. Get invoice record
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, storage_path, status')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    console.error(`[extract] Invoice not found: ${invoiceId}`)
    return
  }

  if (!invoice.storage_path) {
    console.error(`[extract] No storage path for invoice: ${invoiceId}`)
    await supabase.from('invoices').update({ status: 'EXTRACTION_FAILED' }).eq('id', invoiceId)
    return
  }

  // 2. Update status to EXTRACTING
  await supabase.from('invoices').update({ status: 'EXTRACTING' }).eq('id', invoiceId)
  await supabase.from('audit_trail').insert({
    invoice_id: invoiceId,
    from_status: 'INGESTED',
    to_status: 'EXTRACTING',
    actor_email: 'system',
    notes: 'Claude OCR extraction started',
  })

  // 3. Download PDF from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('invoices')
    .download(invoice.storage_path.replace('invoices/', ''))

  if (downloadError || !fileData) {
    console.error(`[extract] Download failed: ${downloadError?.message}`)
    await supabase.from('invoices').update({ status: 'EXTRACTION_FAILED' }).eq('id', invoiceId)
    return
  }

  // 4. Convert to base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // 5. Send to Claude API
  let rawJson: any = null
  let extractionError: string | null = null

  try {
    const response = await client.messages.create({
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
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    })

    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude')

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    rawJson = JSON.parse(cleaned)
    console.log(`[extract] Claude response received — confidence: ${rawJson.overall_confidence}`)

  } catch (err: any) {
    extractionError = err.message
    console.error(`[extract] Claude API error: ${err.message}`)
    await supabase.from('invoices').update({ status: 'EXTRACTION_FAILED' }).eq('id', invoiceId)
    await supabase.from('audit_trail').insert({
      invoice_id: invoiceId,
      from_status: 'EXTRACTING',
      to_status: 'EXTRACTION_FAILED',
      actor_email: 'system',
      notes: `Extraction failed: ${err.message}`,
    })
    return
  }

  const duration = Date.now() - startTime

  // 6. Write OCR extraction record
  await supabase.from('ocr_extractions').insert({
    invoice_id: invoiceId,
    raw_json: rawJson,
    confidence_score: rawJson.overall_confidence,
    field_confidence: rawJson.confidence,
    model_used: 'claude-sonnet-4-5',
    prompt_version: '1.0',
    extraction_duration_ms: duration,
  })

  // 7. Update invoice with extracted fields
  const invoiceUpdate: any = {
    status: 'PENDING_REVIEW',
    invoice_number: rawJson.invoice_number,
    invoice_date: rawJson.invoice_date,
    due_date: rawJson.due_date,
    amount_excl: rawJson.amount_excl,
    amount_vat: rawJson.amount_vat,
    amount_incl: rawJson.amount_incl,
    currency: rawJson.currency ?? 'ZAR',
  }

  // Match supplier — VAT first, then fuzzy name match
  if (rawJson.supplier_name) {
    invoiceUpdate.supplier_name = rawJson.supplier_name
    const { matchSupplier } = await import('@/lib/suppliers/match')
    const match = await matchSupplier(rawJson.supplier_name, rawJson.supplier_vat_number)
    if (match) {
      invoiceUpdate.supplier_id   = match.id
      invoiceUpdate.supplier_name = match.name
    }
  }

  await supabase.from('invoices').update(invoiceUpdate).eq('id', invoiceId)

  // 8. Write line items
  if (rawJson.line_items && rawJson.line_items.length > 0) {
    const lineItems = await Promise.all(
      rawJson.line_items.map(async (item: any, index: number) => {
        let glCodeId: string | null = null
        if (item.suggested_gl_code) {
          const { data: gl } = await supabase
            .from('gl_codes')
            .select('id')
            .eq('xero_account_code', item.suggested_gl_code)
            .maybeSingle()
          if (gl) glCodeId = gl.id
        }
        return {
          invoice_id: invoiceId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          vat_rate: item.vat_rate,
          gl_code_id: glCodeId,
          sort_order: index,
        }
      })
    )
    await supabase.from('invoice_line_items').insert(lineItems)
  }

  // 9. Audit trail
  await supabase.from('audit_trail').insert({
    invoice_id: invoiceId,
    from_status: 'EXTRACTING',
    to_status: 'PENDING_REVIEW',
    actor_email: 'system',
    notes: `Extraction complete — confidence: ${rawJson.overall_confidence} — ${rawJson.line_items?.length ?? 0} line items`,
  })

  console.log(`[extract] ✓ Done — ${invoiceId} → PENDING_REVIEW (${duration}ms)`)
}
