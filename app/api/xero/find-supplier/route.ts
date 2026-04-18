import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xeroGet } from '@/lib/xero/client'
import { requireRole } from '@/lib/auth/require-role'

// Match-only lookup: finds THIS invoice's supplier in Xero by name/VAT,
// upserts the matched contact into our local suppliers table, and links
// it to the invoice. No full sync — only touches the one matched contact.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

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

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, 'AP_CLERK')
  if (!gate.ok) return gate.response

  try {
    const { invoice_id } = await request.json()
    if (!invoice_id) {
      return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Load invoice + any currently-linked supplier's VAT + the raw OCR VAT
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, supplier_name, supplier_id, suppliers(vat_number)')
      .eq('id', invoice_id)
      .single()

    if (!invoice?.supplier_name) {
      return NextResponse.json({ error: 'Invoice has no supplier name' }, { status: 400 })
    }

    // Pull the OCR-extracted VAT number (often more reliable than linked supplier)
    const { data: ocr } = await supabase
      .from('ocr_extractions')
      .select('raw_json')
      .eq('invoice_id', invoice_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const extractedVat: string | null = ocr?.raw_json?.supplier_vat ?? null
    const linkedVat = (invoice.suppliers as any)?.vat_number ?? null
    const supplierName = invoice.supplier_name
    const vatNumber = extractedVat || linkedVat

    // 1. Try VAT match first (most reliable) — Xero filter by TaxNumber
    let matched: any = null
    if (vatNumber) {
      const vatClean = vatNumber.replace(/\s/g, '')
      const where = encodeURIComponent(`TaxNumber=="${vatClean}"`)
      try {
        const data = await xeroGet(`Contacts?where=${where}`)
        const suppliers = (data?.Contacts ?? []).filter((c: any) => c.IsSupplier === true)
        matched = suppliers[0] ?? null
      } catch (err: any) {
        console.warn('[find-supplier] VAT lookup failed:', err.message)
      }
    }

    // 2. Fallback — Xero searchTerm fuzzy match on name
    if (!matched) {
      const cleanName = supplierName.replace(/["']/g, '').trim()
      try {
        const data = await xeroGet(`Contacts?searchTerm=${encodeURIComponent(cleanName)}`)
        const candidates = (data?.Contacts ?? []).filter((c: any) => c.IsSupplier === true)
        matched = candidates.find((c: any) => namesMatch(supplierName, c.Name)) ?? null
      } catch (err: any) {
        console.warn('[find-supplier] Name search failed:', err.message)
      }
    }

    if (!matched) {
      return NextResponse.json({
        found: false,
        message: `No matching supplier found in Xero for "${supplierName}"`,
      })
    }

    // Upsert the matched contact into our local suppliers table
    const { data: supplier, error: dbError } = await supabase
      .from('suppliers')
      .upsert({
        xero_contact_id: matched.ContactID,
        name:            matched.Name,
        vat_number:      matched.TaxNumber ?? null,
        email:           matched.EmailAddress ?? null,
        is_active:       matched.ContactStatus === 'ACTIVE',
        synced_at:       new Date().toISOString(),
      }, { onConflict: 'xero_contact_id' })
      .select('id, name, vat_number')
      .single()

    if (dbError) {
      console.error('[find-supplier] Upsert failed:', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Link the invoice to this supplier
    await supabase
      .from('invoices')
      .update({ supplier_id: supplier.id })
      .eq('id', invoice_id)

    console.log(`[find-supplier] ✓ ${supplierName} → ${matched.Name} (${matched.ContactID})`)
    return NextResponse.json({ found: true, supplier })

  } catch (err: any) {
    console.error('[find-supplier]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
