'use client'

import { useState, useMemo, useEffect, useRef, useId } from 'react'
import { Search } from 'lucide-react'
import { singleExperiences } from '@/lib/experiences'
import { filterExperiences } from '@/lib/explore-search'
import { useI18n } from '@/lib/i18n'
import type { ExperienceCategory } from '@/lib/experiences'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'
import Footer from './Footer'

// Derived from the live catalog so a filter can never point at a category or
// parish nothing is tagged with, and no tour can be stranded behind a missing
// chip (the old hardcoded lists offered Kingston/Music/Food and omitted
// Trelawny, which hid the Martha Brae rafting tour).
const categories: ('All' | ExperienceCategory)[] = [
  'All',
  ...(Array.from(new Set(singleExperiences.map((e) => e.category))).sort() as ExperienceCategory[]),
]
// Parishes ONLY, and only ones something is actually tagged with.
//
// This list used to be `[...destinations, ...parishes]` flattened together, so
// a control labelled "Parish" offered Falmouth, Montego Bay, Negril, Nine Mile
// and Ocho Rios (towns) alongside St. Ann, St. James, Trelawny and Westmoreland
// (parishes). Nine options, four of which were the same places counted twice:
// picking "Ocho Rios" and picking "St. Ann" filtered to overlapping sets, and
// the label was wrong for five of the nine.
//
// Towns are not lost from discovery: the search box already matches
// destination, so typing "Ocho Rios" still finds everything there.
const parishes = [
  'All Parishes',
  ...Array.from(new Set(singleExperiences.map((e) => e.parish))).sort(),
]

export default function ExploreView({ initialQuery = '' }: { initialQuery?: string }) {
  // Handed down by the server route rather than read with useSearchParams,
  // which bailed this whole page out of prerendering. See app/explore/page.tsx.
  const [search, setSearch] = useState(initialQuery)
  const [activeCat, setActiveCat] = useState<string>('All')
  const [activeParish, setActiveParish] = useState('All Parishes')
  const [navHidden, setNavHidden] = useState(false)
  // TopNav's header is 56px at every width; measured once mounted.
  const [navHeight, setNavHeight] = useState(56)
  const [barHeight, setBarHeight] = useState(0)
  const [focusInBar, setFocusInBar] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const results = useRef<HTMLDivElement>(null)
  // Whether the visitor's last move was a key (Tab or an arrow) rather than a
  // tap or a click: only then does focus inside pin the bar. A tapped chip
  // keeps focus in Chrome, and a tapped search box counts as :focus-visible
  // everywhere; either kept the bar over the results with the header gone.
  const lastInputKey = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) lastInputKey.current = true }
    const onPointer = () => { lastInputKey.current = false }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [])
  const { t } = useI18n()
  const parishId = useId()
  // null until hydration = render both grids exactly like the server did.
  const [isMobileVp, setIsMobileVp] = useState<boolean | null>(null)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileVp(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // Follow the server's query when it changes, e.g. a nav search that pushes
  // /explore?q=negril while this component is already mounted.
  useEffect(() => {
    if (initialQuery) setSearch(initialQuery)
  }, [initialQuery])

  // The site header (TopNav) hides on scroll down and comes back on scroll up
  // or when focus enters it. The bar follows the header's real state rather
  // than keeping a scroll rule of its own: the two rules disagreed, and the
  // bar parked at --nav-h (72px on desktop) under a 56px header, so desktop
  // showed a strip of cards between them on the way up and a row of pills
  // left on screen on the way down, and on a phone the header covered the
  // search box (measured on production, Oct 4 2026). Read from the header's
  // own style so TopNav, which checkout shares, stays untouched.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.nav-header')
    if (!nav) return
    const read = () => {
      setNavHidden(nav.style.transform.includes('-100%'))
      setNavHeight(nav.offsetHeight || 56)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(nav, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  // The bar's own height (two rows on a phone, one taller on desktop), so it
  // can sit wholly above the screen edge while the header is away.
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => setBarHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Under a visible header: right below it. While the header is away the bar
  // goes too, unless keyboard focus is inside, when it takes the top edge.
  // It moves by its sticky line, not a transform: a transform left its place
  // in the page empty, a blank band between the intro and the results on
  // every scroll down (199px on a phone). Moved this way it simply scrolls
  // off with the page.
  const barTop = !navHidden ? navHeight : focusInBar ? 0 : -barHeight

  // lib/explore-search: every word of the search, in any order, so a tour
  // typed in the guest's own words ("bamboo rafting Martha Brae") is found.
  const filtered = useMemo(
    () => filterExperiences(singleExperiences, { search, cat: activeCat, parish: activeParish }),
    [search, activeCat, activeParish],
  )

  // A filter changed deep in the list: the results start again just below
  // the header and the bar. Tapping "Culture" at the foot of the page left
  // the guest looking at the footer, its first result far above the screen.
  const filterChanges = useRef(0)
  useEffect(() => {
    if (filterChanges.current++ === 0) return
    const el = results.current
    if (!el) return
    const clear = navHeight + (bar.current?.offsetHeight ?? 0)
    const top = el.getBoundingClientRect().top
    if (top >= clear) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: window.scrollY + top - clear, behavior: reduce ? 'auto' : 'smooth' })
    // Only the filters move it; the header's height is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, activeParish, search])

  const filtering = activeCat !== 'All' || activeParish !== 'All Parishes' || search.trim() !== ''
  const clearAll = () => { setSearch(''); setActiveCat('All'); setActiveParish('All Parishes') }

  return (
    <div className="page-top-mobile" style={{ minHeight: '100vh', paddingTop: 'var(--nav-h)' }}>
      {/* Title sits ABOVE the sticky bar, not inside it. Previously the bar
          carried the h1 and two pill rows, so the thing pinned to the top of
          every scroll was ~180px tall and ate a third of the viewport on a
          phone. The bar now holds only controls. */}
      <div className="container explore-head">
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--gold-text)', marginBottom: 8,
        }}>
          {t('Jamaica, beyond the resort')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 500,
          fontSize: 'var(--fs-h1)', letterSpacing: '-0.025em', lineHeight: 1.04,
          textWrap: 'balance',
        }}>
          {t('Jamaica tours and day trips')}
        </h1>
        {/* One line of indexable text saying what the catalogue IS. The page
            carried a single word, "Explore", as its only heading, which tells
            a reader arriving from a search nothing and tells a crawler less. */}
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.6,
          color: 'var(--text-secondary)', marginTop: 10, maxWidth: '52ch',
        }}>
          {t('Every tour we run, with private door-to-door transport from your hotel included in the price. Filter by what you feel like doing or by where you are staying.')}
        </p>
      </div>

      {/* Sticky controls */}
      <div
        ref={bar}
        className="explore-sticky-bar"
        onFocus={() => setFocusInBar(lastInputKey.current)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInBar(false)
        }}
        style={{
          position: 'sticky', top: barTop, zIndex: 20,
          // Opaque: the blur never rendered in Chrome (the page wrapper's
          // filled opacity animation defeats backdrop-filter), so the results
          // showed sharp through a 94% bar.
          background: 'var(--bg-warm)',
          borderBottom: '1px solid var(--border)',
          // The header's own curve and length, so the two move as one.
          transition: 'top 0.35s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div className="container" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div className="explore-controls" style={{ marginBottom: 12 }}>
            <div style={{
              flex: '1 1 320px', maxWidth: 460, position: 'relative',
              display: 'flex', alignItems: 'center',
            }}>
              <Search size={16} strokeWidth={2} style={{
                position: 'absolute', left: 16, pointerEvents: 'none',
                color: 'var(--text-tertiary)',
              }} />
              <input
                type="search"
                // The page draws its own Clear search button; this class hides
                // the browser's, which showed a second × beside it.
                className="explore-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search experiences...')}
                aria-label="Search experiences"
                style={{
                  // A 3.49:1 edge: the field must read as a field (WCAG 1.4.11).
                  width: '100%', height: 44, borderRadius: 9999,
                  border: '1px solid #8A857C', background: 'var(--surface)',
                  padding: '0 44px 0 42px', fontSize: 16,
                  fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: 0, width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', fontSize: 16, borderRadius: 9999,
                  }}
                >
                  {'✕'}
                </button>
              )}
            </div>

            {/* Nine parishes is a menu, not a pill row. This also gets the
                native wheel picker on iOS and Android. */}
            <label htmlFor={parishId} className="visually-hidden">Filter by parish</label>
            <select
              id={parishId}
              className="explore-select"
              value={activeParish}
              data-active={activeParish !== 'All Parishes'}
              onChange={(e) => setActiveParish(e.target.value)}
            >
              {parishes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="explore-chips" role="group" aria-label="Filter by category">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className="explore-chip"
                onClick={() => setActiveCat(c)}
                aria-pressed={activeCat === c}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2 className="visually-hidden">All experiences</h2>

      <div ref={results} className="container" style={{ paddingTop: 20, paddingBottom: 80 }}>
        {/* Result count. Filters that change nothing visible feel broken, and
            a live region means the change is announced rather than only seen. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 16, minHeight: 32,
        }}>
          <p aria-live="polite" style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 13.5,
            color: 'var(--text-tertiary)', margin: 0,
          }}>
            {filtering
              ? `${filtered.length} of ${singleExperiences.length} experiences`
              : `${singleExperiences.length} experiences`}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                minHeight: 44, padding: '0 16px', borderRadius: 9999,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-dm-sans)',
                fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)',
              }}
            >
              {t('Clear filters')}
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '72px 0' }}>
            <p style={{ fontSize: 22, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 8 }}>
              Nothing matches that yet
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 20 }}>
              Try a wider parish, or clear the filters and browse the whole island.
            </p>
            <button
              onClick={clearAll}
              style={{
                minHeight: 46, padding: '0 24px', borderRadius: 9999,
                background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 600,
              }}
            >
              {t('Clear filters')}
            </button>
          </div>
        ) : (
          <>
            {isMobileVp !== true && (
              <div className="hide-mobile explore-grid">
                {filtered.map((exp) => <ExpCard key={exp.id} exp={exp} />)}
              </div>
            )}
            {isMobileVp !== false && (
              // One full-width reel per row: the 9:16 cards read like a feed
              // and the video actually carries at this size.
              <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {filtered.map((exp, i) => <MobileShort key={exp.id} exp={exp} priority={i === 0} />)}
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
