'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { useCartStore } from '@/lib/cart'
import { useHydrated } from '@/lib/use-hydrated'
import { tourPrice } from '@/lib/experiences'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import TripTimeBar from '@/components/TripTimeBar'

export default function ItineraryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, stops, removeItem, removeStop, subtotal, grandTotal } = useCartStore()
  const { t, formatPrice } = useI18n()

  const asideRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Move keyboard focus into the drawer when it opens; restore it to whatever
  // element was focused before (the trigger) when it closes.
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    asideRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  // Escape closes the drawer; Tab / Shift+Tab are trapped inside it.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const container = asideRef.current
      if (!container) return
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const hydrated = useHydrated()
  if (!hydrated || !open || (items.length === 0 && stops.length === 0)) return null

  // Checkout requires an account. Surface that on the CTA instead of a
  // silent redirect after the user commits, send them to /login with a
  // return path straight back to checkout.
  const checkoutHref = '/checkout'

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 200 }} />

      {/* Drawer */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your itinerary"
        className="animate-slide-right" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400, maxWidth: '92vw',
        background: '#fff', zIndex: 201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 48px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 className="text-headline" style={{ fontSize: 18, marginBottom: 2 }}>{t('Your Itinerary')}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
              {items.length} {items[0]?.kind === 'package'
                ? (items.length === 1 ? 'ready-made day' : 'ready-made days')
                : `experience${items.length !== 1 ? 's' : ''}`} · Jamaica
            </p>
          </div>
          <button onClick={onClose} aria-label="Close itinerary" style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '1px solid var(--border)', background: '#fff',
            cursor: 'pointer', fontSize: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', transition: 'all 0.15s ease',
          }}><X size={16} /></button>
        </div>

        {/* Day Builder */}
        <div style={{
          padding: '16px 24px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-warm, rgba(255, 179, 0, 0.03))',
          position: 'relative',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 12, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            marginBottom: 8,
          }}>
            Day Builder
          </p>
          <TripTimeBar compact />
        </div>

        {items[0]?.kind === 'package' && (
          <p style={{
            padding: '10px 24px 0', fontSize: 12.5, color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.45,
          }}>
            {t('This is a ready-made day. Adding a single experience will replace it.')}
          </p>
        )}

        {/* Items */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 24px' }}>
          {items.map((item, i) => (
            <div key={item.id} style={{
              display: 'flex', gap: 12, paddingBottom: 16, marginBottom: 16,
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ width: 60, height: 60, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                <Image src={item.image} alt={item.title} fill sizes="60px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t(item.title)}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 5 }}>
                  {item.destination} · {t(item.duration)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-dm-sans)', fontWeight: 700 }}>
                    {formatPrice(tourPrice(item.pricing, item.travelers))} · {item.travelers} {item.travelers === 1 ? 'traveler' : 'travelers'}
                  </span>
                  <button onClick={() => removeItem(item.id)} style={{
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    fontSize: 12, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                    textDecoration: 'underline', textUnderlineOffset: 2,
                    minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 4px',
                  }}>{t('Remove')}</button>
                </div>
              </div>
            </div>
          ))}

          {stops.length > 0 && (
            <div style={{ marginTop: items.length > 0 ? 4 : 0 }}>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', marginBottom: 10,
              }}>
                {t('Food stops')} · {t('free')}
              </p>
              {stops.map((stop, i) => (
                <div key={stop.name} style={{
                  display: 'flex', gap: 12, paddingBottom: 12, marginBottom: 12,
                  borderBottom: i < stops.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                    <Image src={stop.image} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-dm-sans)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stop.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>
                        {stop.town} · {stop.knownFor}
                      </span>
                      <button onClick={() => removeStop(stop.name)} style={{
                        background: 'none', border: 'none', color: 'var(--text-tertiary)',
                        fontSize: 12, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                        textDecoration: 'underline', textUnderlineOffset: 2,
                        minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 4px',
                      }}>{t('Remove')}</button>
                    </div>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 4 }}>
                {t('Free roadside stops, your driver builds them into your route.')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '18px 24px 24px' }}>
          {[
            { label: t('Subtotal'), value: subtotal() },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>{row.label}</span>
              <span>{formatPrice(row.value)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 18, marginTop: 8, marginBottom: 18 }}>
            <span>{t('Total')}</span>
            <span>{formatPrice(grandTotal())}</span>
          </div>
          <Link href={checkoutHref} onClick={onClose} style={{ display: 'block', textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', height: 46, fontSize: 14 }}>
              {t('Continue to checkout')} →
            </button>
          </Link>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 12 }}>
            {t('Flexible cancellation within 48 hrs of booking')}
          </p>
        </div>
      </aside>
    </>
  )
}
