import { NextResponse } from 'next/server'
import { fetchTaxRates } from '@/lib/xero/client'

// Diagnostic endpoint — returns all TaxRates configured in the connected Xero org
// Use this to verify which TaxType maps to which effective rate (14% vs 15% etc.)
export async function GET() {
  try {
    const rates = await fetchTaxRates(true) // force refresh
    const summary = rates.map(r => ({
      name: r.Name,
      tax_type: r.TaxType,
      effective_rate: r.EffectiveRate,
      display_rate: r.DisplayTaxRate,
      status: r.Status,
      applies_to_expenses: r.CanApplyToExpenses ?? null,
      applies_to_revenue: r.CanApplyToRevenue ?? null,
    }))
    return NextResponse.json({
      count: rates.length,
      rates: summary,
    })
  } catch (err: any) {
    console.error('[xero/tax-rates]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
