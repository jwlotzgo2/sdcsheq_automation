import { createClient } from '@supabase/supabase-js'
import { xeroGet } from './client'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function syncPaymentStatus() {
  const supabase = getSupabase()

  // Get all invoices that are posted to Xero but not yet paid
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, xero_bill_id, invoice_number, supplier_name')
    .eq('status', 'XERO_POSTED')
    .not('xero_bill_id', 'is', null)

  if (error) {
    console.error('[xero-sync] Failed to fetch invoices:', error.message)
    return { synced: 0, paid: 0, errors: 0 }
  }

  if (!invoices || invoices.length === 0) {
    console.log('[xero-sync] No XERO_POSTED invoices to check')
    return { synced: 0, paid: 0, errors: 0 }
  }

  console.log(`[xero-sync] Checking ${invoices.length} invoices...`)

  let paid = 0
  let errors = 0

  for (const invoice of invoices) {
    try {
      const data = await xeroGet(`Invoices/${invoice.xero_bill_id}`)
      const xeroInvoice = data.Invoices?.[0]

      if (!xeroInvoice) {
        console.warn(`[xero-sync] Invoice ${invoice.xero_bill_id} not found in Xero`)
        continue
      }

      const xeroStatus = xeroInvoice.Status // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED

      if (xeroStatus === 'PAID') {
        await supabase.from('invoices').update({
          status: 'XERO_PAID',
          updated_at: new Date().toISOString(),
        }).eq('id', invoice.id)

        await supabase.from('audit_trail').insert({
          invoice_id: invoice.id,
          from_status: 'XERO_POSTED',
          to_status: 'XERO_PAID',
          actor_email: 'system',
          notes: 'Payment confirmed via Xero sync',
        })

        console.log(`[xero-sync] ✓ ${invoice.supplier_name} ${invoice.invoice_number} — marked PAID`)
        paid++
      } else if (xeroStatus === 'AUTHORISED') {
        // Update to authorised if it's been approved in Xero
        await supabase.from('invoices').update({
          status: 'XERO_AUTHORISED',
          updated_at: new Date().toISOString(),
        }).eq('id', invoice.id)

        await supabase.from('audit_trail').insert({
          invoice_id: invoice.id,
          from_status: 'XERO_POSTED',
          to_status: 'XERO_AUTHORISED',
          actor_email: 'system',
          notes: 'Authorised in Xero',
        })
      } else if (xeroStatus === 'VOIDED') {
        await supabase.from('invoices').update({
          status: 'REJECTED',
          updated_at: new Date().toISOString(),
        }).eq('id', invoice.id)

        await supabase.from('audit_trail').insert({
          invoice_id: invoice.id,
          from_status: 'XERO_POSTED',
          to_status: 'REJECTED',
          actor_email: 'system',
          notes: 'Voided in Xero',
        })
      }
    } catch (err: any) {
      console.error(`[xero-sync] Error checking ${invoice.xero_bill_id}:`, err.message)
      errors++
    }
  }

  console.log(`[xero-sync] Complete — paid: ${paid}, errors: ${errors}`)
  return { synced: invoices.length, paid, errors }
}
