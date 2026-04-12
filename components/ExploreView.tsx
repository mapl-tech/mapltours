'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Calendar } from 'lucide-react'
import { experiences } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'
import type { ExperienceCategory } from '@/lib/experiences'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'

const categories: ('All' | ExperienceCategory)[] = ['All', 'Adventure', 'Nature', 'Music', 'Food', 'Culture', 'Water']
const parishes = ['All Parishes', 'Negril', 'Montego Bay', 'Kingston', 'Ocho Rios', 'Port Antonio', 'Blue Mountains', 'St. Andrew', 'St. Ann', 'Westmoreland', 'Portland', 'St. Elizabeth']

export default function ExploreView() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [dateFilter, setDateFilter] = useState('')
  const [activeCat, setActiveCat] = useState<string>('All')
  const [activeParish, setActiveParish] = useState('All Parishes')
  const [filterHidden, setFilterHidden] = useState(false)
  const { t } = useI18n()
  const lastScrollY = useRef(0)

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 150 && y < lastScrollY.current) {
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
    return experiences.filter((exp) => {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>{t('Explore')}</h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '1px solid var(--border)',
              borderRadius: 9999, padding: '10px 18px',
              flex: 1, maxWidth: 400, minWidth: 180,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <Search size={16} color="var(--text-tertiary)" strokeWidth={2} />
              <input
                type="text" placeholder="Search destinations, activities..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-dm-sans)', fontWeight: 500 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  ×
                </button>
              )}
            </div>

            <div className="hide-mobile" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', border: '1px solid var(--border)',
              borderRadius: 9999, padding: '10px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <Calendar size={15} color="var(--text-tertiary)" strokeWidth={2} />
              <input
                type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                style={{ background: 'none', border: 'none', outline: 'none', color: dateFilter ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 13.5, fontFamily: 'var(--font-dm-sans)', fontWeight: 500, cursor: 'pointer' }}
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="scroll-x" style={{ gap: 6 }}>
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)} style={{
                height: 30, padding: '0 14px', borderRadius: 9999,
                fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                background: activeCat === c ? 'var(--accent)' : 'transparent',
                color: activeCat === c ? '#fff' : 'var(--text-secondary)',
                borderColor: activeCat === c ? 'var(--accent)' : 'var(--border)',
                whiteSpace: 'nowrap',
              }}>
                {c}
              </button>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px', alignSelf: 'center', flexShrink: 0 }} />
            {parishes.map((p) => (
              <button key={p} onClick={() => setActiveParish(p)} style={{
                height: 28, padding: '0 12px', borderRadius: 9999,
                fontSize: 11.5, fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                background: activeParish === p ? 'var(--emerald-dim)' : 'transparent',
                color: activeParish === p ? 'var(--emerald)' : 'var(--text-tertiary)',
                borderColor: activeParish === p ? 'var(--emerald)' : 'var(--border)',
                whiteSpace: 'nowrap',
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="container" style={{ paddingTop: 28, paddingBottom: 80 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ fontSize: 16, fontFamily: 'var(--font-syne)', fontWeight: 700, marginBottom: 6 }}>No experiences found</p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {filtered.map((exp) => <ExpCard key={exp.id} exp={exp} />)}
            </div>
            <div className="hide-desktop mobile-shorts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {filtered.map((exp) => <MobileShort key={exp.id} exp={exp} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
