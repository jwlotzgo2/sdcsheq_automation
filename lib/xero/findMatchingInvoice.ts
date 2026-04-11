// lib/xero/findMatchingInvoice.ts
// Searches Xero for bills (ACCPAY) that match a newly ingested invoice
// by supplier name, VAT number, date, and total amount.

import { createClient } from '@supabase/supabase-js'
import { xeroGet } from './client'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function parseXeroDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/\/Date\((\d+)/)
  if (match) return new Date(parseInt(match[1])).toISOString().split('T')[0]
  if (raw.includes('T') || raw.includes('-')) return raw.split('T')[0]
  return null
}

function toXeroDateTime(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `DateTime(${y},${m},${d})`
}

// Normalize name for fuzzy matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[().,\-_&]/g, ' ')
    .replace(/\b(pty|ltd|inc|cc|npc|rf|sa)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const wordsA = na.split(' ').filter(w => w.length > 2)
  const wordsB = nb.split(' ').filter(w => w.length > 2)
  if (wordsA.length === 0 || wordsB.length === 0) return false
  const matches = wordsA.filter(w => wordsB.includes(w)).length
  return matches / Math.max(wordsA.length, wordsB.length) >= 0.6
}

export interface XeroMatchResult {
  xero_invoice_id: string
  xero_invoice_number: string | null
  xero_contact_name: string | null
  xero_contact_id: string | null
  xero_date: string | null
  xero_due_date: string | null
  xero_total: number | null
  xero_status: string
  xero_vat_number: string | null
  match_confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  match_fields: { supplier: boolean; vat: boolean; date: boolean; amount: boolean }
}

/**
 * Search Xero for ACCPAY bills that potentially match a given invoice.
 * We search by date range (+/- 7 days) and then filter by supplier name,
 * VAT number, and amount in code for more flexible matching.
 */
export async function findMatchingInvoices(params: {
  supplierName?: string | null
  supplierVat?: string | null
  invoiceDate?: string | null
  amountIncl?: number | null
  invoiceNumber?: string | null
}): Promise<XeroMatchResult[]> {
  const { supplierName, supplierVat, invoiceDate, amountIncl, invoiceNumber } = params

  if (!supplierName && !invoiceNumber) {
    console.log('[xero-match] No supplier name or invoice number — skipping')
    return []
  }

  try {
    // Build date range filter: +/- 7 days around the invoice date
    let dateFilter = ''
    if (invoiceDate) {
      const date = new Date(invoiceDate)
      const from = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const to = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      dateFilter = `&&Date>=${toXeroDateTime(from)}&&Date<=${toXeroDateTime(to)}`
    }

    // Query Xero for ACCPAY bills in the date range
    const where = encodeURIComponent(`Type=="ACCPAY"${dateFilter}`)
    const data = await xeroGet(`Invoices?where=${where}&order=Date DESC&page=1`)
    const xeroBills = data?.Invoices ?? []

    if (xeroBills.length === 0) {
      console.log('[xero-match] No ACCPAY bills found in Xero for date range')
      return []
    }

    console.log(`[xero-match] Found ${xeroBills.length} ACCPAY bills in Xero to compare`)

    const matches: XeroMatchResult[] = []

    for (const bill of xeroBills) {
      const xeroContactName = bill.Contact?.Name ?? null
      const xeroTotal = bill.Total != null ? Math.abs(bill.Total) : null
      const xeroDate = parseXeroDate(bill.DateString) || parseXeroDate(bill.Date)
      const xeroDueDate = parseXeroDate(bill.DueDateString) || parseXeroDate(bill.DueDate)
      const xeroInvNum = bill.InvoiceNumber ?? null

      const matchFields = { supplier: false, vat: false, date: false, amount: false }

      // Check supplier name match
      if (supplierName && xeroContactName && namesMatch(supplierName, xeroContactName)) {
        matchFields.supplier = true
      }

      // Check invoice number match (strong signal)
      let invoiceNumberMatch = false
      if (invoiceNumber && xeroInvNum) {
        const cleanA = invoiceNumber.replace(/\s+/g, '').toLowerCase()
        const cleanB = xeroInvNum.replace(/\s+/g, '').toLowerCase()
        if (cleanA === cleanB) {
          invoiceNumberMatch = true
        }
      }

      // Check date match (exact date)
      if (invoiceDate && xeroDate && invoiceDate === xeroDate) {
        matchFields.date = true
      }

      // Check amount match (within 1% or R1 tolerance)
      if (amountIncl != null && xeroTotal != null) {
        const diff = Math.abs(amountIncl - xeroTotal)
        const tolerance = Math.max(1, amountIncl * 0.01) // 1% or R1
        if (diff <= tolerance) {
          matchFields.amount = true
        }
      }

      // Calculate match confidence
      const fieldCount = [matchFields.supplier, matchFields.date, matchFields.amount].filter(Boolean).length

      // Must match supplier (or invoice number) + at least one other field to be considered
      if (!matchFields.supplier && !invoiceNumberMatch) continue
      if (fieldCount < 2 && !invoiceNumberMatch) continue

      let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
      if (invoiceNumberMatch && matchFields.supplier) {
        confidence = 'HIGH'
      } else if (invoiceNumberMatch || fieldCount === 3) {
        confidence = 'HIGH'
      } else if (fieldCount >= 2) {
        confidence = 'MEDIUM'
      }

      matches.push({
        xero_invoice_id: bill.InvoiceID,
        xero_invoice_number: xeroInvNum,
        xero_contact_name: xeroContactName,
        xero_contact_id: bill.Contact?.ContactID ?? null,
        xero_date: xeroDate,
        xero_due_date: xeroDueDate,
        xero_total: xeroTotal,
        xero_status: bill.Status ?? 'UNKNOWN',
        xero_vat_number: bill.Contact?.TaxNumber ?? null,
        match_confidence: confidence,
        match_fields: matchFields,
      })
    }

    // Sort by confidence: HIGH first, then MEDIUM, then LOW
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    matches.sort((a, b) => order[a.match_confidence] - order[b.match_confidence])

    console.log(`[xero-match] Found ${matches.length} potential matches`)
    return matches
  } catch (err: any) {
    console.error('[xero-match] Error searching Xero:', err.message)
    return []
  }
}

/**
 * Run Xero match check for an invoice and store results in DB.
 * Called after extraction completes.
 */
export async function checkAndStoreXeroMatches(invoiceId: string): Promise<number> {
  const supabase = getSupabase()

  // Fetch the invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, supplier_name, invoice_number, invoice_date, amount_incl')
    .eq('id', invoiceId)
    .single()

  if (!invoice) {
    console.error(`[xero-match] Invoice ${invoiceId} not found`)
    return 0
  }

  // Also try to get VAT number from matched supplier
  let supplierVat: string | null = null
  const { data: supplierData } = await supabase
    .from('invoices')
    .select('suppliers(vat_number)')
    .eq('id', invoiceId)
    .single()

  if (supplierData?.suppliers) {
    supplierVat = (supplierData.suppliers as any).vat_number
  }

  // Search Xero
  const matches = await findMatchingInvoices({
    supplierName: invoice.supplier_name,
    supplierVat,
    invoiceDate: invoice.invoice_date,
    amountIncl: invoice.amount_incl,
    invoiceNumber: invoice.invoice_number,
  })

  if (matches.length === 0) {
    console.log(`[xero-match] No matches found for invoice ${invoiceId}`)
    return 0
  }

  // Clear any prior match results for this invoice
  await supabase.from('xero_invoice_matches').delete().eq('invoice_id', invoiceId)

  // Store matches
  const rows = matches.map(m => ({
    invoice_id: invoiceId,
    xero_invoice_id: m.xero_invoice_id,
    xero_invoice_number: m.xero_invoice_number,
    xero_contact_name: m.xero_contact_name,
    xero_contact_id: m.xero_contact_id,
    xero_date: m.xero_date,
    xero_due_date: m.xero_due_date,
    xero_total: m.xero_total,
    xero_status: m.xero_status,
    xero_vat_number: m.xero_vat_number,
    match_confidence: m.match_confidence,
    match_fields: m.match_fields,
  }))

  const { error } = await supabase.from('xero_invoice_matches').insert(rows)
  if (error) {
    console.error('[xero-match] Error storing matches:', error.message)
    return 0
  }

  console.log(`[xero-match] Stored ${matches.length} matches for invoice ${invoiceId}`)
  return matches.length
}
