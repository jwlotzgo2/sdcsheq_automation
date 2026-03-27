import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalize name for fuzzy matching — lowercase, remove punctuation, collapse spaces
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[().,\-_&]/g, ' ')
    .replace(/\b(pty|ltd|inc|cc|npc|rf|sa)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Check if two names are similar enough to match
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)

  // Exact match after normalization
  if (na === nb) return true

  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true

  // Word overlap — if >60% of words match
  const wordsA = na.split(' ').filter(w => w.length > 2)
  const wordsB = nb.split(' ').filter(w => w.length > 2)
  if (wordsA.length === 0 || wordsB.length === 0) return false

  const matches = wordsA.filter(w => wordsB.includes(w)).length
  const overlap = matches / Math.max(wordsA.length, wordsB.length)

  return overlap >= 0.6
}

export async function matchSupplier(
  supplierName: string,
  vatNumber?: string | null
): Promise<{ id: string; name: string; matchedBy: 'vat' | 'name' | 'correction' } | null> {
  const supabase = getSupabase()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, vat_number')
    .eq('is_active', true)

  if (!suppliers || suppliers.length === 0) return null

  // 0. Check prior corrections first
  const { data: correction } = await supabase
    .from('supplier_corrections')
    .select('corrected_to, suppliers!corrected_to(id, name)')
    .eq('extracted_name', supplierName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (correction?.suppliers) {
    const s = correction.suppliers as any
    console.log(`[supplier-match] Correction match: ${supplierName} → ${s.name}`)
    return { id: s.id, name: s.name, matchedBy: 'correction' as any }
  }

  // 1. Try VAT match first
  if (vatNumber) {
    const vatClean = vatNumber.replace(/\s/g, '')
    const vatMatch = suppliers.find(s =>
      s.vat_number && s.vat_number.replace(/\s/g, '') === vatClean
    )
    if (vatMatch) {
      console.log(`[supplier-match] VAT match: ${supplierName} → ${vatMatch.name}`)
      return { id: vatMatch.id, name: vatMatch.name, matchedBy: 'vat' }
    }
  }

  // 2. Try name match
  const nameMatch = suppliers.find(s => namesMatch(supplierName, s.name))
  if (nameMatch) {
    console.log(`[supplier-match] Name match: ${supplierName} → ${nameMatch.name}`)
    return { id: nameMatch.id, name: nameMatch.name, matchedBy: 'name' }
  }

  console.log(`[supplier-match] No match found for: ${supplierName}`)
  return null
}
