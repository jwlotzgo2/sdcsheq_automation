import React from 'npm:react@18.3.1'
import { Resend } from 'npm:resend@4.0.0'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { ConfirmEmail } from './_templates/confirm-email.tsx'
import { MagicLinkEmail } from './_templates/magic-link.tsx'
import { ResetPasswordEmail } from './_templates/reset-password.tsx'
import { EmailChangeEmail } from './_templates/email-change.tsx'
import { InviteEmail } from './_templates/invite.tsx'

const SENDER = 'GoAutomate <noreply@go2analytics.co.za>'
const SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email - GoAutomate',
  magiclink: 'Your sign-in link - GoAutomate',
  recovery: 'Reset your password - GoAutomate',
  email_change: 'Confirm your email change - GoAutomate',
  invite: 'You are invited to GoAutomate',
}

function pickTemplate(t: string, p: any) {
  if (t === 'signup') return React.createElement(ConfirmEmail, p)
  if (t === 'recovery') return React.createElement(ResetPasswordEmail, p)
  if (t === 'email_change') return React.createElement(EmailChangeEmail, p)
  if (t === 'invite') return React.createElement(InviteEmail, p)
  return React.createElement(MagicLinkEmail, p)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.error('[send-email] RESEND_API_KEY missing')
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const payload = await req.text()
    const body = JSON.parse(payload)
    const userEmail = body.user?.email
    const emailData = body.email_data || {}
    const emailType = emailData.email_action_type || 'magiclink'

    console.log('[send-email] ' + emailType + ' -> ' + userEmail)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const props = {
      supabase_url: supabaseUrl,
      token: emailData.token || '',
      token_hash: emailData.token_hash || '',
      redirect_to: emailData.redirect_to || '',
      email_action_type: emailType,
    }

    const html = await renderAsync(pickTemplate(emailType, props))
    const resend = new Resend(resendApiKey)
    const { error } = await resend.emails.send({
      from: SENDER,
      to: [userEmail],
      subject: SUBJECTS[emailType] || 'GoAutomate Notification',
      html,
    })

    if (error) {
      console.error('[send-email] Resend error:', JSON.stringify(error))
    } else {
      console.log('[send-email] Sent ' + emailType + ' to ' + userEmail)
    }
  } catch (e: unknown) {
    console.error('[send-email] Error:', (e as any).message)
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
