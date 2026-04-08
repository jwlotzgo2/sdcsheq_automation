import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xeroPost } from '@/lib/xero/client'

export async function POST(request: NextRequest) {
  try {
    const { name, email, vat_number, phone } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Build Xero contact payload
    const contact: any = {
      Name:       name,
      IsSupplier: true,
    }
    if (email)      contact.EmailAddress = email
    if (vat_number) contact.TaxNumber    = vat_number
    if (phone)      contact.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: phone }]

    // Create in Xero
    const result = await xeroPost('Contacts', { Contacts: [contact] })
    const created = result.Contacts?.[0]

    if (!created || created.HasValidationErrors) {
      const errMsg = created?.ValidationErrors?.map((e: any) => e.Message).join(', ') ?? 'Unknown error'
      return NextResponse.json({ error: errMsg }, { status: 400 })
    }

    // Save to suppliers table
    const { data: supplier, error: dbError } = await supabase
      .from('suppliers')
      .upsert({
        xero_contact_id: created.ContactID,
        name:            created.Name,
        vat_number:      vat_number ?? null,
        email:           email ?? null,
        is_active:       true,
        synced_at:       new Date().toISOString(),
      }, { onConflict: 'xero_contact_id' })
      .select('id, name, xero_contact_id')
      .single()

    if (dbError) {
      console.error('[create-supplier]', dbError.message)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    console.log(`[create-supplier] ✓ Created ${name} in Xero — ${created.ContactID}`)
    return NextResponse.json({ success: true, supplier })

  } catch (err: any) {
    console.error('[create-supplier]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
