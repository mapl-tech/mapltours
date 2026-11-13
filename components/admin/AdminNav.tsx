'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The admin's one navigation, on every admin screen (app/admin/layout.tsx).
 * It replaces the rows of "Cash flow →  Coupons →" links each screen used to
 * carry. The current section is marked for sight and for screen readers
 * (aria-current); a booking's dispatch screen counts as Bookings. On a phone
 * the row takes its own line under the brand and scrolls sideways inside
 * itself, never the page, starting with the current section in view.
 * Styles: the .adm-bar block in app/globals.css.
 */
const SECTIONS: { href: string; label: string; also?: string[] }[] = [
  { href: '/admin/bookings', label: 'Bookings', also: ['/admin/dispatch'] },
  { href: '/admin/refunds', label: 'Refunds' },
  { href: '/admin/cashflow', label: 'Cash flow' },
  { href: '/admin/tour-rates', label: 'Tour prices' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/gift-cards', label: 'Gift cards' },
  { href: '/admin/videos', label: 'Videos' },
  { href: '/admin/driver', label: 'Driver portal' },
]

export default function AdminNav() {
  const path = usePathname() ?? ''
  const isOn = (s: (typeof SECTIONS)[number]) => [s.href, ...(s.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`))
  const listRef = useRef<HTMLUListElement>(null)
  // A section further along (Videos, Driver portal) would start off-screen on
  // a phone: centre it. Only the strip scrolls, never the page.
  useEffect(() => {
    const list = listRef.current
    const on = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !on) return
    const l = list.getBoundingClientRect()
    const r = on.getBoundingClientRect()
    if (r.left < l.left || r.right > l.right) list.scrollLeft += r.left - l.left - (l.width - r.width) / 2
  }, [path])
  return (
    <nav aria-label="Admin" className="adm-nav">
      <ul ref={listRef} className="adm-nav-list">
        {SECTIONS.map((s) => {
          const on = isOn(s)
          return (
            <li key={s.href}>
              {/* A browser leaves a half-visible link where it is when it takes
                  focus; bring all of it, ring included, clear of the fade. */}
              <Link
                href={s.href} className={on ? 'adm-nav-link is-on' : 'adm-nav-link'} aria-current={on ? 'page' : undefined}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
              >
                {s.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
