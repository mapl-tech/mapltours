'use client'

import { useState, useEffect } from 'react'
import { languages, useI18n, detectLanguageByIP } from '@/lib/i18n'

export default function LanguageSwitcher({ variant = 'header', dark = false }: { variant?: 'header' | 'footer'; dark?: boolean }) {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)

  // Auto-detect by IP on first load
  useEffect(() => {
    const stored = localStorage.getItem('mapl-lang')
    if (!stored) {
      detectLanguageByIP().then(setLang)
    }
  }, [setLang])

  const isFooter = variant === 'footer'

  return (
    <div
      data-dropdown
      style={{ position: 'relative' }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isFooter ? '8px 14px' : '6px 12px',
          borderRadius: 9999,
          background: isFooter ? 'rgba(255,255,255,0.06)' : dark ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: isFooter ? '1px solid rgba(255,255,255,0.1)' : dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border)',
          cursor: 'pointer',
          color: isFooter ? '#cccccc' : dark ? 'white' : 'var(--text-secondary)',
          fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
          transition: 'all 0.15s ease',
        }}
      >
        <span>{lang.flag}</span>
        <span>{lang.currency}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          [isFooter ? 'bottom' : 'top']: '100%',
          right: 0,
          marginTop: isFooter ? 0 : 8,
          marginBottom: isFooter ? 8 : 0,
          background: isFooter ? 'var(--bg-dark-warm)' : '#fff',
          border: isFooter ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          padding: '6px 0',
          minWidth: 200,
          zIndex: 200,
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          <p style={{
            padding: '8px 16px 6px',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: isFooter ? 'rgba(255,255,255,0.3)' : 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            Language & Currency
          </p>
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 16px',
                background: l.code === lang.code
                  ? isFooter ? 'rgba(255,255,255,0.06)' : 'var(--surface)'
                  : 'transparent',
                border: 'none', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-dm-sans)',
                transition: 'background 0.1s ease',
              }}
            >
              <span style={{ fontSize: 16 }}>{l.flag}</span>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: 13, fontWeight: l.code === lang.code ? 600 : 400,
                  color: isFooter ? '#fff' : 'var(--text-primary)',
                }}>
                  {l.name}
                </p>
                <p style={{
                  fontSize: 11, marginTop: 1,
                  color: isFooter ? 'rgba(255,255,255,0.4)' : 'var(--text-tertiary)',
                }}>
                  {l.currencySymbol} {l.currency}
                </p>
              </div>
              {l.code === lang.code && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--emerald)',
                }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
