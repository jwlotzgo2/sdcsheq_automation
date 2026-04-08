'use client'

import { useState, useRef, useEffect } from 'react'

const DARK   = '#2A2A2A'
const BORDER = '#E2E0D8'
const WHITE  = '#FFFFFF'
const LIGHT  = '#F5F5F2'
const MUTED  = '#8A8878'
const AMBER  = '#E8960C'

interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
}

export default function SearchableSelect({ options, value, onChange, placeholder = '— Select —', compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const fontSize = compact ? '10px' : '12px'
  const pad = compact ? '3px 5px' : '6px 10px'

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: pad, fontSize, border: `1px solid ${BORDER}`, borderRadius: compact ? '4px' : '6px',
          backgroundColor: WHITE, color: value ? DARK : MUTED, cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {selected ? selected.label : placeholder}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '2px', overflow: 'hidden',
          maxHeight: '240px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px', borderBottom: `1px solid ${LIGHT}`, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: `1px solid ${BORDER}`, borderRadius: '4px', outline: 'none', boxSizing: 'border-box', color: DARK }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              style={{ padding: '6px 10px', fontSize, color: MUTED, cursor: 'pointer', borderBottom: `1px solid ${LIGHT}` }}
            >
              {placeholder}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '11px', color: MUTED, textAlign: 'center' }}>No matches</div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
                style={{
                  padding: '6px 10px', fontSize, cursor: 'pointer',
                  backgroundColor: o.value === value ? '#FEF3C7' : 'transparent',
                  color: DARK, borderBottom: `1px solid ${LIGHT}`,
                }}
                onMouseEnter={e => { if (o.value !== value) (e.target as HTMLElement).style.backgroundColor = LIGHT }}
                onMouseLeave={e => { if (o.value !== value) (e.target as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
