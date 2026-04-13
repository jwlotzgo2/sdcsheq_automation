import { NextResponse } from 'next/server'

export async function GET() {
  const clientId     = process.env.XERO_CLIENT_ID!
  const redirectUri  = process.env.XERO_REDIRECT_URI!
  const scopes       = [
    'openid',
    'profile',
    'email',
    'accounting.contacts',
    'accounting.settings',
    'accounting.invoices',
    'offline_access',
  ].join(' ')

  const state = crypto.randomUUID()

  const url = new URL('https://login.xero.com/identity/connect/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('state', state)

  const response = NextResponse.redirect(url.toString())
  response.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })
  return response
}
