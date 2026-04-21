import { Heading, Link, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import { EmailLayout, buildConfirmUrl, ctaButton, heading, paragraph, codeBlock } from './_layout.tsx'
interface P { supabase_url: string; token: string; token_hash: string; redirect_to: string; email_action_type: string }
export function EmailChangeEmail({ supabase_url, token, token_hash, redirect_to, email_action_type }: P) {
  const u = buildConfirmUrl(supabase_url, token_hash, email_action_type, redirect_to)
  return (<EmailLayout preview="Confirm your new email address"><Heading style={heading}>Confirm email change</Heading><Text style={paragraph}>You requested to change your email address on GoAutomate. Please confirm this change.</Text><Link href={u} target="_blank" style={ctaButton}>Confirm email change</Link><Text style={{ ...paragraph, marginTop: '24px' }}>Or use this confirmation code:</Text><code style={codeBlock}>{token}</code><Text style={{ ...paragraph, marginTop: '24px', color: '#8A8878', fontSize: '13px' }}>This link expires in 1 hour.</Text></EmailLayout>)
}
export default EmailChangeEmail
