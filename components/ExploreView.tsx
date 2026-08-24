'use client'

import { useState, useMemo, useEffect, useRef, useId } from 'react'
import { Search } from 'lucide-react'
import { singleExperiences } from '@/lib/experiences'
import { displayHandle } from '@/lib/creator'
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
  const [filterHidden, setFilterHidden] = useState(false)
  const { t } = useI18n()
  const lastScrollY = useRef(0)
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

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 150 && y > lastScrollY.current) {
        setFilterHidden(true)
      } else {
        setFilterHidden(false)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const filtered = useMemo(() => {
    return singleExperiences.filter((exp) => {
      if (activeCat !== 'All' && exp.category !== activeCat) return false
      // Parish only. The old clause also matched `destination`, which was
      // needed while towns were mixed into this control; now that it offers
      // parishes exclusively, matching destination too would let a town name
      // that happens to equal a parish name pull in the wrong rows.
      if (activeParish !== 'All Parishes' && exp.parish !== activeParish) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !exp.title.toLowerCase().includes(q) &&
          !exp.destination.toLowerCase().includes(q) &&
          !exp.parish.toLowerCase().includes(q) &&
          !exp.category.toLowerCase().includes(q) &&
          !displayHandle(exp.creator).toLowerCase().includes(q) &&
          !exp.description.toLowerCase().includes(q) &&
          !exp.tags.some((tag) => tag.toLowerCase().includes(q))
        ) {
          return false
        }
      }
      return true
    })
  }, [search, activeCat, activeParish])

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
      <div className="explore-sticky-bar" style={{
        position: 'sticky', top: 'var(--nav-h)', zIndex: 20,
        background: 'rgba(250,249,247,0.94)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
        transform: filterHidden ? 'translateY(-100%)' : 'translateY(0)',
      }}>
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search experiences...')}
                aria-label="Search experiences"
                style={{
                  width: '100%', height: 44, borderRadius: 9999,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  padding: '0 40px 0 42px', fontSize: 16,
                  fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: 2, width: 40, height: 40,
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

      <div className="container" style={{ paddingTop: 20, paddingBottom: 80 }}>
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
                minHeight: 32, padding: '0 12px', borderRadius: 9999,
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
