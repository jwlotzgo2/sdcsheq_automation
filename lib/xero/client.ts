import { createClient } from '@supabase/supabase-js'

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
    return { accessToken: settings.access_token, tenantId: settings.tenant_id }
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
      refresh_token: settings.refresh_token,
    }),
  })

  if (!res.ok) {
    console.error('[xero] Token refresh failed:', await res.text())
    return null
  }

  const tokens = await res.json()
  const expiresAt2 = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('xero_settings').update({
    access_token:    tokens.access_token,
    refresh_token:   tokens.refresh_token,
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

  // Build line items
  const lineItems = (invoice.invoice_line_items ?? []).map((line: any) => ({
    Description:  line.description ?? 'Invoice line',
    Quantity:     line.quantity ?? 1,
    UnitAmount:   line.unit_price ?? line.line_total ?? 0,
    AccountCode:  line.gl_codes?.xero_account_code ?? null,
    TaxType:      line.vat_rate > 0 ? 'TAX001' : 'NONE',
  }))

  // Fallback if no line items — use invoice totals
  if (lineItems.length === 0) {
    lineItems.push({
      Description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
      Quantity:    1,
      UnitAmount:  invoice.amount_excl ?? invoice.amount_incl ?? 0,
      AccountCode: null,
      TaxType:     invoice.amount_vat > 0 ? 'TAX001' : 'NONE',
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
