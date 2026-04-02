// lib/claude/extractStatement.ts
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { ExtractedStatement, SupplierStatementConfig } from '@/lib/types/statement'

const anthropic = new Anthropic()

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildExtractionPrompt(config: SupplierStatementConfig | null): string {
  if (!config) {
    return `You are extracting structured data from a supplier statement PDF.

A supplier statement lists multiple transactions over a period — invoices, payments, and credit notes.
It is NOT an invoice. It shows what the supplier believes is owed or was transacted.

Return ONLY a valid JSON object — no markdown, no explanation:

{
  "supplier_name": "string or null",
  "supplier_vat": "string or null",
  "statement_date": "YYYY-MM-DD or null",
  "date_from": "YYYY-MM-DD — the earliest transaction date on the statement, or null",
  "date_to": "YYYY-MM-DD — the latest transaction date on the statement, or null",
  "opening_balance": number_or_null,
  "closing_balance": number_or_null,
  "currency": "ZAR",
  "lines": [
    {
      "line_date": "YYYY-MM-DD or null",
      "reference": "invoice or doc reference as printed, or null",
      "description": "row description as printed, or null",
      "debit_amount": number_or_null,
      "credit_amount": number_or_null,
      "running_balance": number_or_null,
      "line_type": "INVOICE or CREDIT_NOTE or PAYMENT or UNKNOWN"
    }
  ],
  "confidence": 0.0_to_1.0
}

Rules:
- Extract ALL transaction lines. Do not skip any.
- Do not include the opening balance or closing balance rows in lines[].
- All amounts are positive numbers. Charges go in debit_amount. Payments and credits go in credit_amount.
- line_type INVOICE = supplier charging us. PAYMENT = we paid them. CREDIT_NOTE = supplier credited us.
- date_from = minimum date across all lines[]. date_to = maximum date across all lines[].`
  }

  return `You are extracting structured data from a supplier statement PDF.

This is a statement from ${config.layout_notes ? 'a supplier with the following known layout:' : 'a known supplier.'}
${config.layout_notes ? `\n${config.layout_notes}\n` : ''}

COLUMN LABELS FOR THIS SUPPLIER:
- Date format: ${config.date_format}
${config.reference_column_hint ? `- Reference column is labelled: "${config.reference_column_hint}"` : '- Reference column label is unknown — use best judgement'}
${config.reference_pattern ? `- References match this pattern: ${config.reference_pattern}` : ''}
${config.debit_label ? `- Debit (charges to us) column is labelled: "${config.debit_label}"` : ''}
${config.credit_label ? `- Credit (payments/credits) column is labelled: "${config.credit_label}"` : ''}
${config.payment_identifier ? `- Payment rows can be identified by this phrase in the description: "${config.payment_identifier}"` : ''}
${config.opening_balance_label ? `- Opening balance row is labelled: "${config.opening_balance_label}"` : ''}
${config.closing_balance_label ? `- Closing balance row is labelled: "${config.closing_balance_label}"` : ''}

Return ONLY a valid JSON object — no markdown, no explanation:

{
  "supplier_name": "string or null",
  "supplier_vat": "string or null",
  "statement_date": "YYYY-MM-DD or null",
  "date_from": "YYYY-MM-DD — the earliest transaction date on the statement, or null",
  "date_to": "YYYY-MM-DD — the latest transaction date on the statement, or null",
  "opening_balance": number_or_null,
  "closing_balance": number_or_null,
  "currency": "ZAR",
  "lines": [
    {
      "line_date": "YYYY-MM-DD or null",
      "reference": "invoice or doc reference as printed, or null",
      "description": "row description as printed, or null",
      "debit_amount": number_or_null,
      "credit_amount": number_or_null,
      "running_balance": number_or_null,
      "line_type": "INVOICE or CREDIT_NOTE or PAYMENT or UNKNOWN"
    }
  ],
  "confidence": 0.0_to_1.0
}

Rules:
- Extract ALL transaction lines. Do not skip any.
- Do not include the opening balance or closing balance rows in lines[].
- All amounts are positive numbers. Charges go in debit_amount. Payments and credits go in credit_amount.
- Parse dates using the date format specified above: ${config.date_format}
- date_from = minimum date across all lines[]. date_to = maximum date across all lines[].
- If a row matches the payment identifier phrase, set line_type to PAYMENT.`
}

export async function extractStatement(statementId: string): Promise<void> {
  const supabase = getSupabase()

  console.log(`[extractStatement] Starting: ${statementId}`)

  const { data: statement, error: stmtError } = await supabase
    .from('supplier_statements')
    .select('id, storage_path, supplier_id, status')
    .eq('id', statementId)
    .single()

  if (stmtError || !statement) {
    console.error(`[extractStatement] Statement not found: ${statementId}`)
    return
  }

  if (!statement.storage_path) {
    console.error(`[extractStatement] No storage path: ${statementId}`)
    await supabase
      .from('supplier_statements')
      .update({ status: 'FAILED' })
      .eq('id', statementId)
    return
  }

  await supabase
    .from('supplier_statements')
    .update({ status: 'EXTRACTING' })
    .eq('id', statementId)

  const { data: configRow } = await supabase
    .from('supplier_statement_configs')
    .select('*')
    .eq('supplier_id', statement.supplier_id)
    .eq('is_active', true)
    .maybeSingle()

  const config = configRow as SupplierStatementConfig | null
  console.log(`[extractStatement] Config: ${config ? `found (trained by ${config.trained_by})` : 'none — using generic prompt'}`)

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('invoices')
    .download(statement.storage_path)

  if (downloadError || !fileData) {
    console.error(`[extractStatement] Download failed:`, downloadError)
    await supabase
      .from('supplier_statements')
      .update({ status: 'FAILED' })
      .eq('id', statementId)
    return
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const prompt = buildExtractionPrompt(config)

  let extracted: ExtractedStatement
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    extracted = JSON.parse(cleaned)
  } catch (err) {
    console.error(`[extractStatement] Claude error:`, err)
    await supabase
      .from('supplier_statements')
      .update({ status: 'FAILED' })
      .eq('id', statementId)
    return
  }

  const { error: updateError } = await supabase
    .from('supplier_statements')
    .update({
      config_id: config?.id ?? null,
      statement_date: extracted.statement_date,
      date_from: extracted.date_from,
      date_to: extracted.date_to,
      opening_balance: extracted.opening_balance,
      closing_balance: extracted.closing_balance,
      currency: extracted.currency || 'ZAR',
      status: 'EXTRACTED',
      extracted_at: new Date().toISOString(),
    })
    .eq('id', statementId)

  if (updateError) {
    console.error(`[extractStatement] Update error:`, updateError)
    return
  }

  if (extracted.lines && extracted.lines.length > 0) {
    const lineRows = extracted.lines.map((line, index) => ({
      statement_id: statementId,
      line_date: line.line_date,
      reference: line.reference,
      description: line.description,
      debit_amount: line.debit_amount,
      credit_amount: line.credit_amount,
      running_balance: line.running_balance,
      line_type: line.line_type,
      sort_order: index,
    }))

    const { error: lineError } = await supabase
      .from('statement_lines')
      .insert(lineRows)

    if (lineError) {
      console.error(`[extractStatement] Line insert error:`, lineError)
      await supabase
        .from('supplier_statements')
        .update({ status: 'FAILED' })
        .eq('id', statementId)
      return
    }
  }

  console.log(`[extractStatement] Done. ${extracted.lines?.length ?? 0} lines extracted. Date range: ${extracted.date_from} -> ${extracted.date_to}`)
}
