import { Heading, Link, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import { EmailLayout, buildConfirmUrl, ctaButton, heading, paragraph, codeBlock } from './_layout.tsx'
interface P { supabase_url: string; token: string; token_hash: string; redirect_to: string; email_action_type: string }
export function ResetPasswordEmail({ supabase_url, token, token_hash, redirect_to, email_action_type }: P) {
  const u = buildConfirmUrl(supabase_url, token_hash, email_action_type, redirect_to)
  return (<EmailLayout preview="Reset your GoAutomate password"><Heading style={heading}>Reset your password</Heading><Text style={paragraph}>We received a request to reset the password for your GoAutomate account. Click the button below to choose a new password.</Text><Link href={u} target="_blank" style={ctaButton}>Reset your password</Link><Text style={{ ...paragraph, marginTop: '24px' }}>Or use this reset code:</Text><code style={codeBlock}>{token}</code><Text style={{ ...paragraph, marginTop: '24px', color: '#8A8878', fontSize: '13px' }}>This link expires in 1 hour. If you did not request this, no action is needed.</Text></EmailLayout>)
}
export default ResetPasswordEmail
