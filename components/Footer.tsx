'use client'

import { Leaf, Star } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

export default function Footer() {
  const { t } = useI18n()

  return (
    <footer style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border-on-dark)', padding: '56px 0 32px' }}>
      <div className="container">
        {/* Logo + tagline */}
        <div className="footer-brand" style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Leaf size={20} strokeWidth={2.5} color="#fff" />
            </div>
            <div style={{ lineHeight: 1 }}>
              <span style={{
                fontFamily: 'var(--font-syne)', fontWeight: 800,
                fontSize: 18, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'white',
                display: 'block',
              }}>
                MAPL
              </span>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                fontSize: 11, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#cccccc',
                marginTop: 2, display: 'block',
              }}>
                Tours Jamaica
              </span>
            </div>
          </div>
          <p style={{
            fontSize: 14, color: 'var(--text-on-dark-2)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65, maxWidth: 300,
          }}>
            {t('Discover Jamaica beyond the resort. Curated experiences from the people who know Jamaica best.')}
          </p>
        </div>

        {/* Language switcher */}
        <div className="footer-lang" style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--border-on-dark)' }}>
          <LanguageSwitcher variant="footer" />
        </div>

        {/* TripAdvisor badge */}
        <div className="footer-trust" style={{
          paddingBottom: 36, marginBottom: 36,
          borderBottom: '1px solid var(--border-on-dark)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-on-dark-3)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('Recommended on')}
          </span>
          <a href="https://www.tripadvisor.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="12" fill="#34E0A1" />
              <circle cx="8.5" cy="13" r="2.5" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="15.5" cy="13" r="2.5" stroke="white" strokeWidth="1.5" fill="none" />
              <path d="M12 7C9.5 7 7.5 8 6 9.5M12 7C14.5 7 16.5 8 18 9.5M12 7V5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8.5" cy="13" r="0.8" fill="white" />
              <circle cx="15.5" cy="13" r="0.8" fill="white" />
            </svg>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 15, color: 'white' }}>Tripadvisor</span>
          </a>
          <span style={{
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(52,224,161,0.12)',
            border: '1px solid rgba(52,224,161,0.2)',
            fontSize: 11.5, fontWeight: 600, color: '#34E0A1',
            fontFamily: 'var(--font-dm-sans)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Star size={10} fill="#34E0A1" strokeWidth={0} /> 4.9 {t('Excellent')}
          </span>
        </div>

        {/* Link columns */}
        <div className="grid-footer" style={{
          paddingBottom: 36, borderBottom: '1px solid var(--border-on-dark)',
        }}>
          {[
            { title: 'Company', links: [
              { label: 'About', href: '/about' },
              { label: 'Careers', href: '/careers' },
              { label: 'Press', href: '/press' },
              { label: 'Blog', href: '/blog' },
            ]},
            { title: 'Resources', links: [
              { label: 'Help Center', href: '/help' },
              { label: 'Safety', href: '/safety' },
              { label: 'Accessibility', href: '/accessibility' },
              { label: 'Gift Cards', href: '/gifts' },
            ]},
            { title: 'Destinations', links: [
              { label: 'Negril', href: '/explore' },
              { label: 'Kingston', href: '/explore' },
              { label: 'Portland', href: '/explore' },
              { label: 'Ocho Rios', href: '/explore' },
              { label: 'Blue Mountains', href: '/explore' },
            ]},
            { title: 'Connect', links: [
              { label: 'Instagram', href: '#' },
              { label: 'Twitter', href: '#' },
              { label: 'TikTok', href: '#' },
              { label: 'YouTube', href: '#' },
            ]},
          ].map((col) => (
            <div key={col.title}>
              <p style={{
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
                color: 'white', marginBottom: 14, textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {t(col.title)}
              </p>
              {col.links.map((l) => (
                <a key={l.label} href={l.href} style={{
                  display: 'block', fontSize: 14, color: 'var(--text-on-dark-2)',
                  fontFamily: 'var(--font-dm-sans)', marginBottom: 12,
                  cursor: 'pointer', transition: 'color 0.15s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'white' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                >{t(l.label)}</a>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom" style={{
          paddingTop: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 12.5, color: 'var(--text-on-dark-3)',
          fontFamily: 'var(--font-dm-sans)', flexWrap: 'wrap', gap: 16,
        }}>
          <p>© 2025 MAPL Tours. {t('All rights reserved.')} A <a href="https://www.mapltech.com" target="_blank" rel="noopener noreferrer" style={{ color: 'white', fontWeight: 600 }}>MAPL TECH</a> company.</p>
          <div className="footer-legal" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {['Privacy Policy', 'Terms of Service', 'Cookie Preferences'].map((label) => (
              <span key={label} style={{ cursor: 'pointer', transition: 'color 0.15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-3)' }}
              >{t(label)}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
