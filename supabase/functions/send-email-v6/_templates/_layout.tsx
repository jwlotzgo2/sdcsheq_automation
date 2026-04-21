import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'
const A = '#E8960C', D = '#2A2A2A', L = '#F5F5F2', M = '#8A8878'
interface P { preview: string; children: React.ReactNode }
export function EmailLayout({ preview, children }: P) {
  return (<Html><Head /><Preview>{preview}</Preview><Body style={{ backgroundColor: L, fontFamily: 'Arial, sans-serif' }}><Container style={{ margin: '0 auto', padding: '40px 0', maxWidth: '560px' }}><Section style={{ backgroundColor: D, borderRadius: '8px 8px 0 0', padding: '24px 32px', textAlign: 'center' as const }}><table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}><tr><td style={{ backgroundColor: A, borderRadius: '4px', padding: '8px 16px' }}><span style={{ color: '#FFFFFF', fontFamily: 'Arial, sans-serif', fontSize: '18px', fontWeight: 700, lineHeight: '1' }}>GoAutomate</span></td></tr></table></Section><Section style={{ backgroundColor: '#FFFFFF', padding: '32px' }}>{children}</Section><Hr style={{ borderColor: '#E2E0D8', margin: '0' }} /><Section style={{ backgroundColor: '#FFFFFF', borderRadius: '0 0 8px 8px', padding: '20px 32px', textAlign: 'center' as const }}><Text style={{ color: D, fontFamily: 'Arial, sans-serif', fontSize: '13px', fontWeight: '600' as const, margin: '0 0 4px' }}>GoAutomate - SDC SHEQ</Text><Text style={{ color: M, fontFamily: 'Arial, sans-serif', fontSize: '12px', margin: '0 0 12px' }}>Powered by Go 2 Analytics (Pty) Ltd</Text><Text style={{ color: M, fontFamily: 'Arial, sans-serif', fontSize: '11px', fontStyle: 'italic' as const, margin: '0' }}>If you did not expect this email, you can safely ignore it.</Text></Section></Container></Body></Html>)
}
export const ctaButton = { backgroundColor: A, borderRadius: '6px', color: '#FFFFFF', display: 'inline-block', fontFamily: 'Arial, sans-serif', fontSize: '16px', fontWeight: '600' as const, lineHeight: '100%', padding: '14px 28px', textDecoration: 'none', textAlign: 'center' as const }
export const heading = { color: D, fontFamily: 'Arial, sans-serif', fontSize: '24px', fontWeight: '700' as const, lineHeight: '1.3', margin: '0 0 16px', padding: '0' }
export const paragraph = { color: D, fontFamily: 'Arial, sans-serif', fontSize: '15px', lineHeight: '1.6', margin: '0 0 16px' }
export const codeBlock = { display: 'inline-block' as const, padding: '14px 24px', backgroundColor: L, borderRadius: '6px', border: '1px solid #E2E0D8', color: D, fontFamily: 'monospace', fontSize: '20px', fontWeight: '600' as const, letterSpacing: '4px' }

// Build the confirmation URL. Prefers the app-owned /auth/confirm route
// (token_hash flow) embedded in redirect_to. Falls back to the legacy
// Supabase /verify redirect for projects whose redirect_to is not a full URL.
export function buildConfirmUrl(supabase_url: string, token_hash: string, email_action_type: string, redirect_to: string): string {
  try {
    const url = new URL(redirect_to)
    url.searchParams.set('token_hash', token_hash)
    url.searchParams.set('type', email_action_type)
    return url.toString()
  } catch {
    return supabase_url + '/auth/v1/verify?token=' + token_hash + '&type=' + email_action_type + '&redirect_to=' + redirect_to
  }
}
