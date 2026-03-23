import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    console.error('[xero/callback] Error:', error)
    return NextResponse.redirect(`${origin}/admin/settings?xero=error`)
  }

  const clientId     = process.env.XERO_CLIENT_ID!
  const clientSecret = process.env.XERO_CLIENT_SECRET!
  const redirectUri  = process.env.XERO_REDIRECT_URI!

  // Exchange code for tokens
  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('[xero/callback] Token exchange failed:', err)
    return NextResponse.redirect(`${origin}/admin/settings?xero=error`)
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in } = tokens

  // Get tenant (organisation) list
  const tenantsRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const tenants = await tenantsRes.json()
  console.log('[xero/callback] Tenants:', JSON.stringify(tenants))

  // Use first tenant (user will pick in settings if multiple)
  const tenant = tenants[0]
  if (!tenant) {
    return NextResponse.redirect(`${origin}/admin/settings?xero=no_tenant`)
  }

  // Store in xero_settings
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  // Upsert — only one Xero connection per app
  const { error: upsertError } = await supabase
    .from('xero_settings')
    .upsert({
      id:              '00000000-0000-0000-0000-000000000001', // singleton row
      tenant_id:       tenant.tenantId,
      tenant_name:     tenant.tenantName,
      access_token,
      refresh_token,
      token_expires_at: expiresAt,
      connected_at:    new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'id' })

  if (upsertError) {
    console.error('[xero/callback] Upsert error:', upsertError.message)
    return NextResponse.redirect(`${origin}/admin/settings?xero=error`)
  }

  console.log(`[xero/callback] ✓ Connected to ${tenant.tenantName}`)
  return NextResponse.redirect(`${origin}/admin/settings?xero=connected`)
}
