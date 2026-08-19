'use client'

import Link from 'next/link'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

export default function Footer() {
  const { t } = useI18n()

  return (
    <footer style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border-on-dark)', padding: '56px 0 32px' }}>
      <div className="container">
        {/* Logo + tagline */}
        <div className="footer-brand" style={{ marginBottom: 40 }}>
          {/* Dark-ground variant, sitting directly on --bg-dark. It carries a
              white wordmark and an outlined bus, so it needs no white plate
              behind it, the plate was a workaround from before that variant
              existed. Same 42px as the header lockup so the mark reads at one
              consistent size top and bottom. */}
          <div style={{ display: 'inline-block', marginBottom: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="logo-on-dark"
              src="/mapl-logo-dark.svg"
              alt="MAPL Tours Jamaica"
              width={185}
              height={42}
              style={{ height: 42, width: 'auto', display: 'block' }}
            />
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

        {/* Tripadvisor link.
            This block used to read "Recommended on [Tripadvisor] ★ 4.9
            Excellent" and pointed at tripadvisor.com generally. MAPL's actual
            listing has zero reviews and no rating at all, so the badge
            asserted a rating from a named third party that did not exist,
            using their trademark to do it. That is unlawful in MAPL's main
            markets (FTC Act s5, Canada's Competition Act, the UK DMCC Act
            2024) and is grounds for Tripadvisor to suspend the listing.
            What remains is a plain link to the real listing, with no rating
            claimed. Add a rating here only when Tripadvisor shows one, and
            only the number they actually show. */}
        <div className="footer-trust" style={{
          paddingBottom: 36, marginBottom: 36,
          borderBottom: '1px solid var(--border-on-dark)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-on-dark-3)', fontFamily: 'var(--font-dm-sans)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('Find us on')}
          </span>
          <a href="https://www.tripadvisor.ca/Attraction_Review-g147311-d34605425-Reviews-MAPL_Tours_Jamaica-Montego_Bay_Saint_James_Parish_Jamaica.html" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
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
        </div>

        {/* Link columns */}
        <div className="grid-footer" style={{
          paddingBottom: 36, borderBottom: '1px solid var(--border-on-dark)',
        }}>
          {[
            { title: 'Company', links: [
              { label: 'About', href: '/about' },
              { label: 'Contact us', href: '/contact' },
              { label: 'Careers', href: '/careers' },
              { label: 'Partner with us', href: '/partner' },
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
              { label: 'Ocho Rios', href: '/explore?q=Ocho%20Rios' },
              { label: 'Montego Bay', href: '/explore?q=Montego%20Bay' },
              { label: 'Falmouth', href: '/explore?q=Falmouth' },
              { label: 'Negril', href: '/explore?q=Negril' },
              { label: 'Nine Mile', href: '/explore?q=Nine%20Mile' },
            ]},
            { title: 'Connect', links: [
              { label: 'Instagram', href: 'https://www.instagram.com/mapltoursjamaica' },
              { label: 'TikTok', href: 'https://www.tiktok.com/@mapltoursjamaica' },
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
              {col.links.map((l) => {
                const isExternal = l.href.startsWith('http')
                return (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    style={{
                      display: 'block', fontSize: 14, color: 'var(--text-on-dark-2)',
                      fontFamily: 'var(--font-dm-sans)', marginBottom: 12,
                      cursor: 'pointer', transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'white' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                  >
                    {t(l.label)}
                  </a>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom" style={{
          paddingTop: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 12, color: 'var(--text-on-dark-3)',
          fontFamily: 'var(--font-dm-sans)', flexWrap: 'wrap', gap: 16,
        }}>
          <p>© 2026 MAPL Tours Jamaica. {t('All rights reserved.')}</p>
          <div className="footer-legal" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
            ].map(({ label, href }) => (
              <Link key={label} href={href} style={{ color: 'var(--text-on-dark-3)', textDecoration: 'none', cursor: 'pointer', transition: 'color 0.15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-on-dark-3)' }}
              >{t(label)}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
