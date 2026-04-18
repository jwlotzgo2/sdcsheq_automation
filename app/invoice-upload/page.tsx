'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useDropzone, type FileRejection } from 'react-dropzone'
import AppShell from '@/components/layout/AppShell'

const AMBER = '#E8960C'
const DARK = '#2A2A2A'
const BORDER = '#E2E0D8'
const LIGHT = '#F5F5F2'
const RED = '#EF4444'
const GREEN = '#16A34A'

const MAX_BYTES = 10 * 1024 * 1024

type State =
  | { kind: 'idle' }
  | { kind: 'selected'; file: File }
  | { kind: 'uploading'; file: File }
  | { kind: 'success'; invoiceId: string }
  | { kind: 'error'; message: string; duplicateInvoiceId?: string; file?: File }

export default function InvoiceUploadPage() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    if (rejected.length > 0) {
      const first = rejected[0]
      const code = first.errors[0]?.code
      const msg = code === 'file-too-large'
        ? 'File exceeds 10 MB limit.'
        : code === 'file-invalid-type'
        ? 'Only PDF files are accepted.'
        : first.errors[0]?.message ?? 'File rejected.'
      setState({ kind: 'error', message: msg })
      return
    }
    if (accepted[0]) setState({ kind: 'selected', file: accepted[0] })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_BYTES,
    multiple: false,
  })

  const upload = async (file: File) => {
    setState({ kind: 'uploading', file })
    const body = new FormData()
    body.append('file', file)
    let res: Response
    try {
      res = await fetch('/api/invoices/upload', { method: 'POST', body })
    } catch {
      setState({ kind: 'error', message: 'Network error. Try again.', file })
      return
    }
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setState({ kind: 'success', invoiceId: data.invoice_id })
      return
    }
    if (res.status === 409) {
      setState({
        kind: 'error',
        message: `Already uploaded on ${new Date(data.existing_created_at).toLocaleString()}.`,
        duplicateInvoiceId: data.existing_id,
      })
      return
    }
    setState({ kind: 'error', message: data.error ?? `Upload failed (${res.status}).`, file })
  }

  const reset = () => setState({ kind: 'idle' })

  return (
    <AppShell>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: DARK, marginBottom: '4px' }}>Upload Invoice</h1>
        <p style={{ fontSize: '13px', color: '#6B6B5E', marginBottom: '20px' }}>
          Drop a PDF below. It will run through the same AI extraction pipeline as emailed invoices
          and land in the Review Queue.
        </p>

        {(state.kind === 'idle' || (state.kind === 'error' && !state.file)) && (
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? AMBER : BORDER}`,
              borderRadius: '10px',
              padding: '48px 16px',
              backgroundColor: isDragActive ? '#FEF3C7' : LIGHT,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📥</div>
            <div style={{ fontSize: '14px', color: DARK, fontWeight: 500 }}>
              {isDragActive ? 'Drop the PDF here' : 'Drop PDF here or click to browse'}
            </div>
            <div style={{ fontSize: '12px', color: '#8A8878', marginTop: '4px' }}>PDF only · Max 10 MB</div>
          </div>
        )}

        {state.kind === 'selected' && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '16px', backgroundColor: '#FFFFFF' }}>
            <div style={{ fontSize: '14px', color: DARK, marginBottom: '12px' }}>
              ✓ <strong>{state.file.name}</strong> ({(state.file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ flex: 1, padding: '10px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Remove
              </button>
              <button
                onClick={() => upload(state.file)}
                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Upload &amp; Extract
              </button>
            </div>
          </div>
        )}

        {state.kind === 'uploading' && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '24px', backgroundColor: '#FFFFFF', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: DARK }}>Uploading <strong>{state.file.name}</strong>…</div>
          </div>
        )}

        {state.kind === 'success' && (
          <div style={{ border: `1px solid ${GREEN}`, borderRadius: '10px', padding: '20px', backgroundColor: '#F0FDF4' }}>
            <div style={{ fontSize: '14px', color: DARK, marginBottom: '4px' }}>
              ✓ Uploaded. Extraction running…
            </div>
            <div style={{ fontSize: '12px', color: '#4B4B42', marginBottom: '16px' }}>
              Invoice ID: <code>{state.invoiceId}</code>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ flex: 1, padding: '10px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Upload another
              </button>
              <Link
                href="/review"
                style={{ flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', textDecoration: 'none', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
              >
                View in Review Queue
              </Link>
            </div>
          </div>
        )}

        {state.kind === 'error' && (
          <div style={{ border: `1px solid ${RED}`, borderRadius: '10px', padding: '16px', backgroundColor: '#FEF2F2', marginTop: state.file ? 0 : '12px' }}>
            <div style={{ fontSize: '14px', color: RED, marginBottom: '8px' }}>{state.message}</div>
            {state.duplicateInvoiceId && (
              <Link href={`/invoices/${state.duplicateInvoiceId}`} style={{ fontSize: '13px', color: AMBER, textDecoration: 'underline' }}>
                View existing invoice →
              </Link>
            )}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={reset}
                style={{ padding: '8px 14px', border: `1px solid ${BORDER}`, borderRadius: '6px', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '13px' }}
              >
                Start over
              </button>
              {state.file && (
                <button
                  onClick={() => upload(state.file!)}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: AMBER, color: '#FFFFFF', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
