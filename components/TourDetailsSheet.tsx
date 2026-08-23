'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { X, Check, Backpack, Users, Activity, Info, MapPin, Clock } from 'lucide-react'
import type { Experience } from '@/lib/experiences'
import { priceUnitLabel } from '@/lib/experiences'
import { useI18n } from '@/lib/i18n'

/**
 * Everything a guest needs before committing to a tour: what happens, what the
 * price covers, what it does not, what to bring, who it suits.
 *
 * The reel sells the feeling; this answers the questions that actually decide a
 * purchase. It reads the detail fields on the Experience itself — the same
 * approved copy for all 22 tours and packages — not the separate
 * lib/tour-details module, which only ever covered ids 1 to 15 and left the
 * packages with no inclusions at all.
 *
 * Deliberately a dialog rather than a route: it opens centered over the reel
 * so the guest never loses their place in the feed.
 */
/* Module scope, not inside the component: defined inline these would get a
   new identity every render, and React would unmount and remount the whole
   dialog body each time the parent reel re-renders while the dialog is open. */

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

const Bullets = ({ items, tone = 'plain' }: { items: string[]; tone?: 'in' | 'out' | 'plain' }) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {items.map((x) => (
      <li key={x} style={{
        display: 'flex', gap: 9, alignItems: 'flex-start',
        fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)',
      }}>
        <span aria-hidden style={{
          flexShrink: 0, marginTop: 3,
          color: tone === 'in' ? 'var(--emerald)' : 'var(--text-tertiary)',
        }}>
          {tone === 'in' ? <Check size={14} strokeWidth={2.5} />
            : tone === 'out' ? <X size={14} strokeWidth={2.5} />
            : '·'}
        </span>
        {x}
      </li>
    ))}
  </ul>
)

const Fact = ({ icon, label, children }: { icon: React.ReactNode; label?: string; children: React.ReactNode }) => (
  <p style={{
    display: 'flex', gap: 9, alignItems: 'flex-start',
    fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)',
  }}>
    <span aria-hidden style={{ flexShrink: 0, marginTop: 3, color: 'var(--text-tertiary)', display: 'inline-flex' }}>{icon}</span>
    <span>
      {label && <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}.</strong>}
      {label ? ' ' : ''}{children}
    </span>
  </p>
)

export interface TourDetailsCta {
  inCart: boolean
  blocked: boolean
  reason?: string | null
  onToggle: () => void
}

export default function TourDetailsSheet({ exp, onClose, cta }: { exp: Experience; onClose: () => void; cta?: TourDetailsCta }) {
  const { t, formatPrice } = useI18n()

  // Dismissal plays a short exit before unmounting; a timer rather than
  // animationend so the dialog can never get stuck open if the animation is
  // suppressed entirely.
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const requestClose = useCallback(() => {
    setClosing((already) => {
      if (!already) closeTimer.current = window.setTimeout(onClose, 170)
      return true
    })
  }, [onClose])
  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current) }, [])

  // aria-modal below tells assistive tech nothing outside this dialog exists.
  // Escape alone did not keep that promise: Tab walked straight out into the
  // reel behind, onto controls a screen reader was no longer announcing.
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, requestClose)

  // Focus the scrollable body once open (after the trap has focused the
  // panel) so arrow keys page through the content immediately; the panel
  // itself no longer scrolls, its body does.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bodyRef.current?.focus() }, [])

  // Close only on a true scrim click: press and release both on the
  // backdrop. A text selection that starts inside the panel and is released
  // over the scrim fires its click on the overlay too, and must not dismiss
  // the dialog.
  const scrimPress = useRef(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const groupMax = exp.pricing.mode === 'group' ? exp.pricing.tierMax : null
  const hasGoodToKnow = Boolean(exp.meetingPoint || exp.ages || exp.fitness || exp.additionalInfo?.length)

  return (
    <div
      className={`tour-modal-overlay${closing ? ' closing' : ''}`}
      onPointerDown={(e) => { scrimPress.current = e.target === e.currentTarget }}
      onClick={(e) => {
        // The dialog mounts inside the reel, whose root click toggles
        // playback; nothing that happens in here may leak into that handler.
        e.stopPropagation()
        if (scrimPress.current && e.target === e.currentTarget) requestClose()
        scrimPress.current = false
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-details-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="tour-modal-panel"
        style={{
          background: 'var(--bg, #fff)', width: 'min(640px, 100%)',
          maxHeight: 'min(720px, 100%)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 'var(--r-2xl)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold-text)', marginBottom: 6,
            }}>
              {exp.category}
            </p>
            <h2 id="tour-details-title" style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 21, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              {t(exp.title)}
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: 'var(--text-tertiary)',
              marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {exp.destination}, {exp.parish}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {exp.duration}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatPrice(exp.price)} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{priceUnitLabel(exp.pricing)}</span>
              </span>
            </p>
          </div>
          <button
            onClick={requestClose}
            aria-label="Close details"
            style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
              border: '1px solid var(--border)', background: 'var(--bg, #fff)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={bodyRef}
          role="region"
          aria-labelledby="tour-details-title"
          tabIndex={0}
          style={{
            overflowY: 'auto', overscrollBehavior: 'contain',
            padding: cta ? '2px 22px 24px' : '2px 22px calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.65,
            color: 'var(--text-primary)', marginTop: 18,
          }}>
            {exp.about ?? t(exp.description)}
          </p>

          {exp.included?.length ? (
            <Section icon={<Check size={15} />} title={t('What is included')}>
              <Bullets items={exp.included} tone="in" />
            </Section>
          ) : null}

          {exp.notIncluded?.length ? (
            <Section icon={<X size={15} />} title={t('Not included')}>
              <Bullets items={exp.notIncluded} tone="out" />
            </Section>
          ) : null}

          {exp.bring?.length ? (
            <Section icon={<Backpack size={15} />} title={t('What to bring')}>
              <Bullets items={exp.bring} />
            </Section>
          ) : null}

          {hasGoodToKnow && (
            <Section icon={<Info size={15} />} title={t('Good to know')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {exp.meetingPoint && (
                  <Fact icon={<MapPin size={14} strokeWidth={2.5} />} label="Meeting point">{exp.meetingPoint}</Fact>
                )}
                {exp.ages && (
                  <Fact icon={<Users size={14} strokeWidth={2.5} />} label="Who it suits">
                    {exp.ages}{groupMax ? `. Private tour, one price for up to ${groupMax} people` : ''}
                  </Fact>
                )}
                {exp.fitness && (
                  <Fact icon={<Activity size={14} strokeWidth={2.5} />} label="Effort">{exp.fitness}</Fact>
                )}
                {(exp.additionalInfo ?? []).map((note) => (
                  <Fact key={note} icon={<Info size={14} strokeWidth={2.5} />}>{note}</Fact>
                ))}
              </div>
            </Section>
          )}

          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: 'var(--text-tertiary)',
            marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', lineHeight: 1.6,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Activity size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Cancel within 48 hours of booking, less a 20% administration charge.{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Full policy (opens in a new tab)"
                style={{ textDecoration: 'underline' }}
              >
                Full policy
              </a>
            </span>
          </p>
        </div>

        {/* A guest the details just convinced should not have to hunt for the
            button hidden behind the dialog. Same wiring as the reel CTA. */}
        {cta && (
          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--border)',
            padding: '12px 22px calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontFamily: 'var(--font-dm-sans)' }}>
              <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                {formatPrice(exp.price)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{priceUnitLabel(exp.pricing)}</span>
            </div>
            <button
              onClick={cta.onToggle}
              disabled={cta.blocked}
              title={cta.blocked ? cta.reason ?? undefined : undefined}
              style={{
                minHeight: 48, padding: '0 24px', borderRadius: 9999,
                background: cta.inCart ? 'var(--emerald)' : cta.blocked ? 'var(--surface)' : 'var(--accent)',
                color: cta.inCart ? '#fff' : cta.blocked ? 'var(--text-tertiary)' : '#fff',
                fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                border: 'none', cursor: cta.blocked ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              {cta.inCart ? t('✓ In Trip') : cta.blocked ? t('Another day') : t('Add to Trip')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
