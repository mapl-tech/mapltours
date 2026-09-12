'use client'

import Link from 'next/link'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

/**
 * Follow links, shown as brand icons rather than a text list. Each `<a>` is a
 * 44px tile (.footer-social) with an aria-label, because an icon with no text
 * has no accessible name otherwise. Glyphs are inline single-colour SVGs
 * (currentColor), the same approach as the Tripadvisor mark above, so no icon
 * font is pulled in and they inherit the footer's hover/focus colours.
 */
const SOCIALS: { label: string; href: string; icon: JSX.Element }[] = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/mapltoursjamaica',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.12 1.38C1.36 2.67.95 3.34.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0m0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4m6.41-10.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@mapltoursjamaica',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/1332003366660610',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@mapltoursjamaica',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
]

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
            {t('Discover Jamaica beyond the resort. Private transfers and tours, run by the people who know Jamaica best.')}
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

          {/* Connect: brand icons, not a text list. */}
          <div>
            <p style={{
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-dm-sans)',
              color: 'white', marginBottom: 14, textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {t('Connect')}
            </p>
            {/* A nav landmark so assistive tech announces these as one named
                group rather than three unrelated links. No `title`: it would
                duplicate the aria-label, which some screen readers then read
                twice, and a tooltip never appears on touch anyway. */}
            <nav className="footer-social" aria-label={t('Social media')}>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`MAPL Tours Jamaica on ${s.label}`}
                >
                  {s.icon}
                </a>
              ))}
            </nav>
          </div>
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
