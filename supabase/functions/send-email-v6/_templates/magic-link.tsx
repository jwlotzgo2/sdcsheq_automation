import { Heading, Link, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import { EmailLayout, buildConfirmUrl, ctaButton, heading, paragraph, codeBlock } from './_layout.tsx'
interface P { supabase_url: string; token: string; token_hash: string; redirect_to: string; email_action_type: string }
export function MagicLinkEmail({ supabase_url, token, token_hash, redirect_to, email_action_type }: P) {
  const u = buildConfirmUrl(supabase_url, token_hash, email_action_type, redirect_to)
  return (<EmailLayout preview="Your GoAutomate sign-in link"><Heading style={heading}>Sign in to GoAutomate</Heading><Text style={paragraph}>Click the button below to sign in to your GoAutomate account.</Text><Link href={u} target="_blank" style={ctaButton}>Sign in to GoAutomate</Link><Text style={{ ...paragraph, marginTop: '24px' }}>Or use this one-time code:</Text><code style={codeBlock}>{token}</code><Text style={{ ...paragraph, marginTop: '24px', color: '#8A8878', fontSize: '13px' }}>This link expires in 1 hour.</Text></EmailLayout>)
}
export default MagicLinkEmail
