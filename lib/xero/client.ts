import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.XERO_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw new Error('XERO_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return Buffer.from(hex, 'hex')
}

function encrypt(plaintext: string): string {
  const iv  = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24):tag(32):ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !dataHex) return ciphertext // not encrypted, return as-is
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8')
}


function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Get a valid access token — refreshes if expired
export async function getXeroToken(): Promise<{ accessToken: string; tenantId: string } | null> {
  const supabase = getSupabase()

  const { data: settings } = await supabase
    .from('xero_settings')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle()

  if (!settings) {
    console.error('[xero] No Xero connection found')
    return null
  }

  // Check if token is still valid (with 5 min buffer)
  const expiresAt  = new Date(settings.token_expires_at).getTime()
  const bufferMs   = 5 * 60 * 1000
  const needsRefresh = Date.now() > expiresAt - bufferMs

  if (!needsRefresh) {
    return { accessToken: decrypt(settings.access_token), tenantId: settings.tenant_id }
  }

  // Refresh the token
  console.log('[xero] Refreshing access token...')
  const clientId     = process.env.XERO_CLIENT_ID!
  const clientSecret = process.env.XERO_CLIENT_SECRET!

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: decrypt(settings.refresh_token),
    }),
  })

  if (!res.ok) {
    console.error('[xero] Token refresh failed:', await res.text())
    return null
  }

  const tokens = await res.json()
  const expiresAt2 = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('xero_settings').update({
    access_token:    encrypt(tokens.access_token),
    refresh_token:   encrypt(tokens.refresh_token),
    token_expires_at: expiresAt2,
    updated_at:      new Date().toISOString(),
  }).eq('id', '00000000-0000-0000-0000-000000000001')

  console.log('[xero] ✓ Token refreshed')
  return { accessToken: tokens.access_token, tenantId: settings.tenant_id }
}

// Generic Xero API GET
export async function xeroGet(path: string) {
  const auth = await getXeroToken()
  if (!auth) throw new Error('No Xero connection')

  const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
    headers: {
      'Authorization': `Bearer ${auth.accessToken}`,
      'Xero-Tenant-Id': auth.tenantId,
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Xero GET ${path} failed: ${err}`)
  }

  return res.json()
}

// Generic Xero API POST
export async function xeroPost(path: string, body: any) {
  const auth = await getXeroToken()
  if (!auth) throw new Error('No Xero connection')

  const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${auth.accessToken}`,
      'Xero-Tenant-Id': auth.tenantId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Xero POST ${path} failed: ${err}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Tax type resolution
// Different Xero orgs map "INPUT" / "INPUT2" to different effective rates,
// so we query /TaxRates and pick the active tax type matching the expected
// VAT rate instead of hardcoding a type code.
// ---------------------------------------------------------------------------

export interface XeroTaxRate {
  Name: string
  TaxType: string
  EffectiveRate: number
  DisplayTaxRate: number
  Status: string
  CanApplyToExpenses?: boolean
  CanApplyToAssets?: boolean
  CanApplyToLiabilities?: boolean
  CanApplyToEquity?: boolean
  CanApplyToRevenue?: boolean
}

let _taxRatesCache: { rates: XeroTaxRate[]; fetchedAt: number } | null = null
const TAX_RATES_TTL_MS = 10 * 60 * 1000 // 10 min

export async function fetchTaxRates(force = false): Promise<XeroTaxRate[]> {
  if (!force && _taxRatesCache && Date.now() - _taxRatesCache.fetchedAt < TAX_RATES_TTL_MS) {
    return _taxRatesCache.rates
  }
  const data = await xeroGet('TaxRates')
  const rates: XeroTaxRate[] = data?.TaxRates ?? []
  _taxRatesCache = { rates, fetchedAt: Date.now() }
  return rates
}

/**
 * Find the Xero TaxType code for a given effective rate on standard-rate
 * purchases/expenses. Multiple tax rates can share the same effective rate
 * (e.g. Bad Debt, Change in Use, Capital Goods all 15%), so we prefer the
 * one named "Standard Rate Purchases" and explicitly exclude special
 * categories. Falls back to 'INPUT' only if no match is found.
 */
export async function getInputTaxType(expectedRate: number): Promise<string> {
  try {
    const rates = await fetchTaxRates()

    // Active + can apply to expenses + rate matches (±0.01 tolerance for float safety)
    const candidates = rates.filter(r =>
      r.Status === 'ACTIVE'
      && (r.CanApplyToExpenses ?? true)
      && Math.abs(r.EffectiveRate - expectedRate) < 0.01
    )

    if (candidates.length === 0) {
      const allExpense = rates
        .filter(r => r.Status === 'ACTIVE' && (r.CanApplyToExpenses ?? true))
        .map(r => `${r.TaxType}=${r.EffectiveRate}%`)
        .join(', ')
      console.warn(`[xero] No tax rate matching ${expectedRate}%. Active expense rates: ${allExpense}`)
      return 'INPUT' // legacy fallback
    }

    // Exclude special categories — Bad Debt, Change in Use, Capital Goods,
    // Second-hand Goods, Imports, Exempt, Zero Rated, Other.
    const excludePattern = /bad debt|change in use|capital goods|second-?hand|imported|exempt|zero|other/i
    const standardPattern = /^standard rate purchases$/i

    const best =
      candidates.find(r => standardPattern.test(r.Name))
      || candidates.find(r => !excludePattern.test(r.Name))
      || candidates[0]

    console.log(`[xero] Tax type for ${expectedRate}% → ${best.TaxType} (${best.Name})`)
    return best.TaxType
  } catch (err: any) {
    console.error('[xero] Failed to fetch tax rates, falling back to INPUT:', err.message)
    return 'INPUT'
  }
}

// Sync GL codes (Accounts) from Xero
export async function syncGlCodes() {
  const supabase = getSupabase()
  console.log('[xero] Syncing GL codes...')

  const data = await xeroGet('Accounts?where=Status=="ACTIVE"')
  const accounts = data.Accounts ?? []

  let synced = 0
  for (const acc of accounts) {
    await supabase.from('gl_codes').upsert({
      xero_account_code: acc.Code,
      name:         acc.Name,
      account_type: acc.Type,
      description:  acc.Description ?? null,
      is_active:    acc.Status === 'ACTIVE',
      synced_at:    new Date().toISOString(),
    }, { onConflict: 'xero_account_code' })
    synced++
  }

  console.log(`[xero] ✓ Synced ${synced} GL codes`)
  return synced
}

// Sync Suppliers (Contacts) from Xero
export async function syncSuppliers() {
  const supabase = getSupabase()
  console.log('[xero] Syncing suppliers...')

  const data = await xeroGet('Contacts?where=IsSupplier==true AND ContactStatus=="ACTIVE"')
  const contacts = data.Contacts ?? []

  let synced = 0
  for (const contact of contacts) {
    await supabase.from('suppliers').upsert({
      xero_contact_id: contact.ContactID,
      name:            contact.Name,
      vat_number:      contact.TaxNumber ?? null,
      email:           contact.EmailAddress ?? null,
      is_active:       contact.ContactStatus === 'ACTIVE',
      synced_at:       new Date().toISOString(),
    }, { onConflict: 'xero_contact_id' })
    synced++
  }

  console.log(`[xero] ✓ Synced ${synced} suppliers`)
  return synced
}

// Push approved invoice to Xero as a Bill
export async function pushInvoiceToXero(invoiceId: string) {
  const supabase = getSupabase()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, suppliers(*), invoice_line_items(*, gl_codes(*))')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  // Duplicate check — has this already been pushed?
  const { data: existing } = await supabase
    .from('xero_push_log')
    .select('id, xero_bill_id')
    .eq('invoice_id', invoiceId)
    .eq('push_status', 'SUCCESS')
    .maybeSingle()

  if (existing) {
    console.log(`[xero] Invoice ${invoiceId} already pushed — ${existing.xero_bill_id}`)
    return { alreadyPushed: true, xero_bill_id: existing.xero_bill_id }
  }

  // Resolve the correct TaxType code by querying Xero's configured rates.
  // Default to 15% SA VAT; fall back to each line's own vat_rate if set.
  const DEFAULT_VAT_RATE = 15
  const inferredLineRate = (rate: number | null | undefined) =>
    rate && rate > 0 ? rate : DEFAULT_VAT_RATE

  // Build line items — resolve TaxType per line based on its vat_rate
  const lineItems = await Promise.all(
    (invoice.invoice_line_items ?? []).map(async (line: any) => {
      const hasVat = (line.vat_rate ?? 0) > 0 || (invoice.amount_vat ?? 0) > 0
      const taxType = hasVat
        ? await getInputTaxType(inferredLineRate(line.vat_rate))
        : 'NONE'
      return {
        Description:  line.description ?? 'Invoice line',
        Quantity:     line.quantity ?? 1,
        UnitAmount:   line.unit_price ?? line.line_total ?? 0,
        AccountCode:  line.gl_codes?.xero_account_code ?? null,
        TaxType:      taxType,
      }
    })
  )

  // Fallback if no line items — use invoice totals
  if (lineItems.length === 0) {
    const hasVat = (invoice.amount_vat ?? 0) > 0
    const taxType = hasVat ? await getInputTaxType(DEFAULT_VAT_RATE) : 'NONE'
    lineItems.push({
      Description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
      Quantity:    1,
      UnitAmount:  invoice.amount_excl ?? invoice.amount_incl ?? 0,
      AccountCode: null,
      TaxType:     taxType,
    })
  }

  const xeroInvoice: any = {
    Type:          'ACCPAY',
    InvoiceNumber: invoice.invoice_number ?? undefined,
    Date:          invoice.invoice_date ?? new Date().toISOString().split('T')[0],
    DueDate:       invoice.due_date ?? undefined,
    Status:        'DRAFT',
    LineItems:     lineItems,
    LineAmountTypes: 'Exclusive',
  }

  // Match supplier
  if (invoice.suppliers?.xero_contact_id) {
    xeroInvoice.Contact = { ContactID: invoice.suppliers.xero_contact_id }
  } else if (invoice.supplier_name) {
    xeroInvoice.Contact = { Name: invoice.supplier_name }
  }

  // Update invoice status
  await supabase.from('invoices').update({ status: 'PUSHING_TO_XERO' }).eq('id', invoiceId)

  try {
    const result = await xeroPost('Invoices', { Invoices: [xeroInvoice] })
    const pushed = result.Invoices?.[0]

    if (!pushed || pushed.HasErrors) {
      const errorMsg = pushed?.ValidationErrors?.map((e: any) => e.Message).join(', ') ?? 'Unknown error'
      throw new Error(errorMsg)
    }

    // Success
    await supabase.from('xero_push_log').insert({
      invoice_id:       invoiceId,
      push_status:      'SUCCESS',
      xero_bill_id:     pushed.InvoiceID,
      xero_bill_number: pushed.InvoiceNumber,
      response_body:    pushed,
      pushed_at:        new Date().toISOString(),
    })

    await supabase.from('invoices').update({
      status:          'XERO_POSTED',
      xero_bill_id:    pushed.InvoiceID,
      xero_bill_number: pushed.InvoiceNumber,
    }).eq('id', invoiceId)

    await supabase.from('audit_trail').insert({
      invoice_id:  invoiceId,
      from_status: 'APPROVED',
      to_status:   'XERO_POSTED',
      actor_email: 'system',
      notes:       `Posted to Xero — Bill ID: ${pushed.InvoiceID}`,
    })

    console.log(`[xero] ✓ Invoice ${invoiceId} pushed — ${pushed.InvoiceID}`)
    return { success: true, xero_bill_id: pushed.InvoiceID }

  } catch (err: any) {
    await supabase.from('xero_push_log').insert({
      invoice_id:   invoiceId,
      push_status:  'FAILED',
      error_detail: err.message,
      pushed_at:    new Date().toISOString(),
    })

    await supabase.from('invoices').update({ status: 'XERO_PUSH_FAILED' }).eq('id', invoiceId)

    console.error(`[xero] Push failed for ${invoiceId}:`, err.message)
    throw err
  }
}
