'use client'

import { useState, useEffect, useRef } from 'react'
import { languages, useI18n, detectLanguageByIP } from '@/lib/i18n'
import { requestConsentPrompt } from '@/lib/consent'

export default function LanguageSwitcher({ variant = 'header', dark = false }: { variant?: 'header' | 'footer'; dark?: boolean }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  // The button that opens this menu: where the keyboard goes back to when the cookie question, opened from here, is put away.
  const toggle = useRef<HTMLButtonElement>(null)

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
        ref={toggle}
        onClick={() => setOpen(!open)}
        className={isFooter ? 'tap-target' : 'tap-target-down'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isFooter ? '8px 14px' : '6px 12px',
          borderRadius: 9999,
          background: isFooter ? 'rgba(255,255,255,0.06)' : dark ? 'rgba(0,0,0,0.38)' : 'transparent',
          border: isFooter ? '1px solid rgba(255,255,255,0.1)' : dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border)',
          cursor: 'pointer',
          color: isFooter ? '#cccccc' : dark ? 'white' : 'var(--text-secondary)',
          fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
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
        }}>
          <p style={{
            padding: '8px 16px 6px',
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: isFooter ? 'rgba(255,255,255,0.3)' : 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            Language & Currency
          </p>
          {/* The list scrolls by itself, so the row under it is always in view. */}
          <div style={{ maxHeight: 264, overflowY: 'auto' }}>
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
                  fontSize: 12, marginTop: 1,
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
          {/* The way back to the cookie question from every page that has the
              navigation: several pages (transfers, contact, the account) have
              no footer, where the other "Cookie Preferences" is. This menu is
              the site's settings on those pages. */}
          <div style={{
            borderTop: isFooter ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--border)',
            marginTop: 6, paddingTop: 6,
          }}>
            <button
              type="button"
              data-cookie-preferences=""
              onClick={() => { setOpen(false); requestConsentPrompt(toggle.current) }}
              style={{
                display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, padding: '0 16px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 500,
                color: isFooter ? '#fff' : 'var(--text-primary)',
              }}
            >
              {t('Cookie Preferences')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
