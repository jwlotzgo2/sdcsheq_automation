import { Heading, Link, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
import { EmailLayout, buildConfirmUrl, ctaButton, heading, paragraph, codeBlock } from './_layout.tsx'
interface P { supabase_url: string; token: string; token_hash: string; redirect_to: string; email_action_type: string }
export function InviteEmail({ supabase_url, token, token_hash, redirect_to, email_action_type }: P) {
  const u = buildConfirmUrl(supabase_url, token_hash, email_action_type, redirect_to)
  return (<EmailLayout preview="You have been invited to GoAutomate"><Heading style={heading}>You are invited!</Heading><Text style={paragraph}>You have been invited to join GoAutomate, the accounts payable automation platform for SDC SHEQ. Click the button below to set up your account.</Text><Link href={u} target="_blank" style={ctaButton}>Accept invitation</Link><Text style={{ ...paragraph, marginTop: '24px' }}>Or use this invitation code:</Text><code style={codeBlock}>{token}</code><Text style={{ ...paragraph, marginTop: '24px', color: '#8A8878', fontSize: '13px' }}>This link expires in 24 hours.</Text></EmailLayout>)
}
export default InviteEmail
