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

async function buildExtractionPrompt(supabase: any): Promise<string> {
  // Load real GL codes from DB
  const { data: glCodes } = await supabase
    .from('gl_codes')
    .select('xero_account_code, name, account_type')
    .eq('is_active', true)
    .in('account_type', ['EXPENSE', 'DIRECTCOSTS', 'OVERHEADS', 'CURRLIAB', 'FIXED'])
    .order('xero_account_code')

  const glList = (glCodes ?? [])
    .filter((g: any) => g.xero_account_code && g.name)
    .map((g: any) => `- ${g.xero_account_code}: ${g.name}`)
    .join('\n')

  return `You are an accounts payable assistant for SDC SHEQ Compliance, a South African health and safety consulting company. Extract structured data from this invoice PDF.

CRITICAL — SUPPLIER vs CUSTOMER DISTINCTION:
- SDC SHEQ Compliance / SDC Health And Safety (Pty) Ltd / SDC Health and Safety is the BUYER/CUSTOMER — they are the company receiving and paying the invoice. NEVER identify them as the supplier.
- The SUPPLIER is the company that ISSUED the invoice — typically shown in the header, logo area, or "From" section of the invoice.
- The billing address (showing SDC's address) is where the invoice is SENT TO — this is the customer, not the supplier.
- Look for the issuing company's name near the logo, at the top of the invoice, or in the "From" or "Supplier" field.

CRITICAL — VAT-EXCLUSIVE LINE VALUES:
- "unit_price" and "line_total" MUST be VAT-EXCLUSIVE (net of VAT). Xero adds VAT on top of these values, so passing VAT-inclusive figures will double-charge VAT.
- If the invoice shows both "Incl." and "Excl." columns for line items, ALWAYS use the Excl. value.
- If the invoice only shows an Incl. value per line, divide by (1 + vat_rate/100) — default vat_rate is 15 for South African invoices.
- Sanity check: the sum of all line_total values should equal amount_excl (the invoice subtotal before VAT), not amount_incl.
- "amount_excl", "amount_vat", "amount_incl" remain as printed on the invoice footer/summary.

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

For suggested_gl_code and suggested_gl_name, use ONLY codes from this list (SDC SHEQ's actual Xero chart of accounts):
${glList}

Choose the most appropriate expense GL code based on the line item description. If unsure, leave as null.`
}

const EXTRACTION_PROMPT_FALLBACK = `You are an accounts payable assistant. Extract structured data from this invoice PDF.
Return ONLY a valid JSON object — no markdown, no explanation.
Use suggested_gl_code null if you cannot determine the GL code.`

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
              text: await buildExtractionPrompt(supabase),
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

  // 8. Reconcile line items against amount_excl — if Claude grabbed VAT-incl values,
  //    Σ line_total will equal amount_incl rather than amount_excl. Rescale in that case.
  const reconciliationNotes: string[] = []
  if (rawJson.line_items && rawJson.line_items.length > 0 && rawJson.amount_excl) {
    const lineSum = rawJson.line_items.reduce(
      (s: number, l: any) => s + Number(l.line_total ?? 0), 0
    )
    const amountExcl = Number(rawJson.amount_excl)
    const amountIncl = Number(rawJson.amount_incl ?? 0)
    const within = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.02) // ±2% or R1

    if (!within(lineSum, amountExcl) && amountIncl > 0 && within(lineSum, amountIncl)) {
      // Lines are VAT-inclusive — rescale to excl using amount_excl/amount_incl ratio
      const ratio = amountExcl / amountIncl
      reconciliationNotes.push(
        `Line totals were VAT-inclusive (Σ=${lineSum.toFixed(2)} matched amount_incl=${amountIncl.toFixed(2)}). Rescaled by ${ratio.toFixed(4)} to match amount_excl=${amountExcl.toFixed(2)}.`
      )
      rawJson.line_items = rawJson.line_items.map((l: any) => ({
        ...l,
        unit_price: l.unit_price != null ? Number(l.unit_price) * ratio : null,
        line_total: l.line_total != null ? Number(l.line_total) * ratio : null,
      }))
    } else if (!within(lineSum, amountExcl)) {
      reconciliationNotes.push(
        `Line totals do not reconcile: Σ line_total=${lineSum.toFixed(2)}, amount_excl=${amountExcl.toFixed(2)}, amount_incl=${amountIncl.toFixed(2)}. Lines kept as extracted.`
      )
    }
  }

  // 9. Write line items
  if (rawJson.line_items && rawJson.line_items.length > 0) {
    const lineItems = await Promise.all(
      rawJson.line_items.map(async (item: any, index: number) => {
        // Smart GL matching — corrections first, then supplier default, then Claude suggestion
        const { matchGlCode } = await import('@/lib/suppliers/gl-match')
        const glCodeId = await matchGlCode(
          item.suggested_gl_code,
          item.description,
          invoiceUpdate.supplier_id ?? null
        )
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

  // 10. Audit trail
  const reconciliationSuffix = reconciliationNotes.length > 0 ? ` — ${reconciliationNotes.join(' ')}` : ''
  await supabase.from('audit_trail').insert({
    invoice_id: invoiceId,
    from_status: 'EXTRACTING',
    to_status: 'PENDING_REVIEW',
    actor_email: 'system',
    notes: `Extraction complete — confidence: ${rawJson.overall_confidence} — ${rawJson.line_items?.length ?? 0} line items${reconciliationSuffix}`,
    metadata: {
      model: 'claude-sonnet-4-5',
      duration_ms: duration,
      line_count: rawJson.line_items?.length ?? 0,
      reconciliation: reconciliationNotes,
    },
  })

  // 11. Trigger Xero match check (non-blocking)
  try {
    const { checkAndStoreXeroMatches } = await import('@/lib/xero/findMatchingInvoice')
    checkAndStoreXeroMatches(invoiceId).catch(err =>
      console.error(`[extract] Xero match check failed (non-blocking): ${err.message}`)
    )
  } catch (err: any) {
    console.error(`[extract] Could not trigger Xero match: ${err.message}`)
  }

  console.log(`[extract] ✓ Done — ${invoiceId} → PENDING_REVIEW (${duration}ms)`)
}
