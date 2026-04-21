import { Heading, Link, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import { EmailLayout, buildConfirmUrl, ctaButton, heading, paragraph, codeBlock } from './_layout.tsx'
interface P { supabase_url: string; token: string; token_hash: string; redirect_to: string; email_action_type: string }
export function ConfirmEmail({ supabase_url, token, token_hash, redirect_to, email_action_type }: P) {
  const u = buildConfirmUrl(supabase_url, token_hash, email_action_type, redirect_to)
  return (<EmailLayout preview="Confirm your email address for GoAutomate"><Heading style={heading}>Confirm your email</Heading><Text style={paragraph}>Thanks for signing up for GoAutomate. Please confirm your email address by clicking the button below.</Text><Link href={u} target="_blank" style={ctaButton}>Confirm your email</Link><Text style={{ ...paragraph, marginTop: '24px' }}>Or use this confirmation code:</Text><code style={codeBlock}>{token}</code><Text style={{ ...paragraph, marginTop: '24px', color: '#8A8878', fontSize: '13px' }}>This link will expire in 1 hour.</Text></EmailLayout>)
}
export default ConfirmEmail
