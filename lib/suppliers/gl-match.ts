import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function matchGlCode(
  suggestedCode: string | null,
  lineDescription: string,
  supplierId?: string | null
): Promise<string | null> {
  const supabase = getSupabase()

  // 1. Check prior corrections for this supplier + similar description
  if (supplierId) {
    const { data: corrections } = await supabase
      .from('gl_corrections')
      .select('corrected_gl_id, line_description')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (corrections && corrections.length > 0) {
      // Find correction with matching description keywords
      const descLower = lineDescription.toLowerCase()
      const match = corrections.find(c => {
        if (!c.line_description) return false
        const words = c.line_description.toLowerCase().split(' ').filter((w: string) => w.length > 3)
        return words.some((w: string) => descLower.includes(w))
      })
      if (match?.corrected_gl_id) {
        console.log(`[gl-match] Correction match for: ${lineDescription}`)
        return match.corrected_gl_id
      }
    }
  }

  // 2. Check supplier default GL code
  if (supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('default_gl_code_id')
      .eq('id', supplierId)
      .maybeSingle()
    if (supplier?.default_gl_code_id) {
      console.log(`[gl-match] Supplier default GL for: ${lineDescription}`)
      return supplier.default_gl_code_id
    }
  }

  // 3. Fall back to Claude's suggested code
  if (suggestedCode) {
    const { data: gl } = await supabase
      .from('gl_codes')
      .select('id')
      .eq('xero_account_code', suggestedCode)
      .maybeSingle()
    if (gl) return gl.id
  }

  return null
}

export async function logGlCorrection(
  invoiceId: string,
  supplierId: string | null,
  lineDescription: string,
  extractedGlId: string | null,
  correctedGlId: string,
  correctedBy: string
) {
  const supabase = getSupabase()
  await supabase.from('gl_corrections').insert({
    invoice_id:      invoiceId,
    supplier_id:     supplierId,
    line_description: lineDescription,
    extracted_gl_id: extractedGlId,
    corrected_gl_id: correctedGlId,
    corrected_by:    correctedBy,
  })
}

export async function logSupplierCorrection(
  invoiceId: string,
  extractedName: string,
  correctedSupplierId: string,
  correctedBy: string
) {
  const supabase = getSupabase()
  await supabase.from('supplier_corrections').insert({
    invoice_id:    invoiceId,
    extracted_name: extractedName,
    corrected_to:  correctedSupplierId,
    corrected_by:  correctedBy,
  })
}
