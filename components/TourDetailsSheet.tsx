'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { X, Check, Backpack, Users, Activity, Info, MapPin, Clock } from 'lucide-react'
import { getTourDetail } from '@/lib/tour-details'
import type { Experience } from '@/lib/experiences'
import { priceUnitLabel } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'

/**
 * Everything a guest needs before committing to a tour: what happens, what the
 * price covers, what to bring, who it suits.
 *
 * The reel sells the feeling; this answers the questions that actually decide a
 * purchase. Before it existed the deepest page in the funnel asked for hundreds
 * of dollars while saying nothing about transport, entrance fees, minimum age
 * or what to wear.
 *
 * Deliberately a sheet rather than a route: it opens over the reel so the guest
 * never loses their place in the feed.
 */
export default function TourDetailsSheet({ exp, onClose }: { exp: Experience; onClose: () => void }) {
  const { t, formatPrice } = useI18n()
  const detail = getTourDetail(exp.id)

  // aria-modal below tells assistive tech nothing outside this sheet exists.
  // Escape alone did not keep that promise: Tab walked straight out into the
  // reel behind, onto controls a screen reader was no longer announcing.
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <section style={{ marginTop: 22 }}>
      <h3 style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 14,
        color: 'var(--text-primary)', marginBottom: 10,
      }}>
        <span aria-hidden style={{ color: 'var(--gold-text)', display: 'inline-flex' }}>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )

  const Bullets = ({ items, tick }: { items: string[]; tick?: boolean }) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((x) => (
        <li key={x} style={{
          display: 'flex', gap: 9, alignItems: 'flex-start',
          fontFamily: 'var(--font-dm-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)',
        }}>
          <span aria-hidden style={{ flexShrink: 0, marginTop: 3, color: tick ? 'var(--emerald)' : 'var(--text-tertiary)' }}>
            {tick ? <Check size={14} strokeWidth={2.5} /> : '·'}
          </span>
          {x}
        </li>
      ))}
    </ul>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${exp.title} details`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="tour-sheet"
        style={{
          background: 'var(--bg, #fff)', width: '100%', maxWidth: 620,
          maxHeight: '88vh', overflowY: 'auto',
          borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0',
          padding: '22px 22px calc(28px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold-text)', marginBottom: 6,
            }}>
              {exp.category}
            </p>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 21, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              {t(exp.title)}
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: 'var(--text-tertiary)',
              marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {exp.destination}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {exp.duration}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatPrice(exp.price)} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{priceUnitLabel(exp.pricing)}</span>
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            style={{
              width: 40, height: 40, flexShrink: 0, borderRadius: '50%',
              border: '1px solid var(--border)', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {detail ? (
          <>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.65,
              color: 'var(--text-primary)', marginTop: 18,
            }}>
              {detail.about}
            </p>

            <Section icon={<Check size={15} />} title="What's included">
              <Bullets items={detail.included} tick />
            </Section>

            <Section icon={<Backpack size={15} />} title="What to bring">
              <Bullets items={detail.bring} />
            </Section>

            <Section icon={<Users size={15} />} title="Who it suits">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Ages', detail.minAge],
                  ['Group size', detail.maxGroup],
                  ['Activity level', detail.fitness],
                ].map(([k, v]) => (
                  <p key={k} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{k}:</strong> {v}
                  </p>
                ))}
              </div>
            </Section>

            <Section icon={<Info size={15} />} title="Good to know">
              <Bullets items={detail.goodToKnow} />
            </Section>

            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: 'var(--text-tertiary)',
              marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', lineHeight: 1.6,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Activity size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              Cancel within 48 hours of booking, less a 20% administration charge.{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Full policy</a>
            </p>
          </>
        ) : (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14.5, lineHeight: 1.65, color: 'var(--text-secondary)', marginTop: 18 }}>
            {t(exp.description)}
          </p>
        )}
      </div>
    </div>
  )
}
