'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { singleExperiences } from '@/lib/experiences'
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
const parishes = [
  'All Parishes',
  ...Array.from(
    new Set(singleExperiences.flatMap((e) => [e.destination, e.parish])),
  ).sort(),
]

export default function ExploreView() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [activeCat, setActiveCat] = useState<string>('All')
  const [activeParish, setActiveParish] = useState('All Parishes')
  const [filterHidden, setFilterHidden] = useState(false)
  const { t } = useI18n()
  const lastScrollY = useRef(0)
  // null until hydration = render both grids exactly like the server did.
  const [isMobileVp, setIsMobileVp] = useState<boolean | null>(null)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileVp(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])

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
      if (activeParish !== 'All Parishes' && exp.parish !== activeParish && exp.destination !== activeParish) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !exp.title.toLowerCase().includes(q) &&
          !exp.destination.toLowerCase().includes(q) &&
          !exp.parish.toLowerCase().includes(q) &&
          !exp.category.toLowerCase().includes(q) &&
          !exp.creator.toLowerCase().includes(q) &&
          !exp.description.toLowerCase().includes(q) &&
          !exp.tags.some((t) => t.toLowerCase().includes(q))
        ) {
          return false
        }
      }
      return true
    })
  }, [search, activeCat, activeParish])

  return (
    <div className="page-top-mobile" style={{ minHeight: '100vh', paddingTop: 56 }}>
      {/* Sticky filters */}
      <div className="explore-sticky-bar" style={{
        position: 'sticky', top: 56, zIndex: 20,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
        transform: filterHidden ? 'translateY(-100%)' : 'translateY(0)',
      }}>
        <div className="container" style={{ paddingTop: 18, paddingBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 500, fontSize: 'var(--fs-h2)', letterSpacing: '-0.02em', marginBottom: 14 }}>{t('Explore')}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{
              flex: '1 1 260px', maxWidth: 420, position: 'relative',
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
                  {'\u2715'}
                </button>
              )}
            </div>
          </div>

          <div className="scroll-x" style={{ gap: 8 }}>
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)}
                aria-pressed={activeCat === c}
                onMouseEnter={(e) => { if (activeCat !== c) e.currentTarget.style.background = 'var(--surface-hover)' }}
                onMouseLeave={(e) => { if (activeCat !== c) e.currentTarget.style.background = 'var(--surface)' }}
                style={{
                height: 44, padding: '0 16px', borderRadius: 9999,
                fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                background: activeCat === c ? 'var(--accent)' : 'var(--surface)',
                color: activeCat === c ? '#fff' : 'var(--text-secondary)',
                borderColor: activeCat === c ? 'var(--accent)' : 'var(--border)',
                whiteSpace: 'nowrap',
              }}>
                {c}
              </button>
            ))}
          </div>
          <div className="scroll-x" style={{ gap: 8, marginTop: 8 }}>
            <span style={{
              alignSelf: 'center', flexShrink: 0, margin: '0 4px',
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
            }}>
              Parish
            </span>
            {parishes.map((p) => (
              <button key={p} onClick={() => setActiveParish(p)}
                aria-pressed={activeParish === p}
                onMouseEnter={(e) => { if (activeParish !== p) e.currentTarget.style.background = 'var(--surface-hover)' }}
                onMouseLeave={(e) => { if (activeParish !== p) e.currentTarget.style.background = 'var(--surface)' }}
                style={{
                height: 44, padding: '0 16px', borderRadius: 9999,
                fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                background: activeParish === p ? 'var(--accent)' : 'var(--surface)',
                color: activeParish === p ? '#fff' : 'var(--text-secondary)',
                borderColor: activeParish === p ? 'var(--accent)' : 'var(--border)',
                whiteSpace: 'nowrap',
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <h2 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
        All experiences
      </h2>
      <div className="container" style={{ paddingTop: 28, paddingBottom: 80 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ fontSize: 16, fontFamily: 'var(--font-dm-sans)', fontWeight: 700, marginBottom: 6 }}>No experiences found</p>
            <button
              onClick={() => { setSearch(''); setActiveCat('All'); setActiveParish('All Parishes') }}
              style={{
                marginTop: 10, minHeight: 44, padding: '0 22px', borderRadius: 9999,
                background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 600,
              }}
            >
              Clear all filters
            </button>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {isMobileVp !== true && (
              <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                {filtered.map((exp) => <ExpCard key={exp.id} exp={exp} />)}
              </div>
            )}
            {isMobileVp !== false && (
              <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
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
