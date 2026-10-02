'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildQuote } from '@/lib/airport-transfers'
import { parseHandoff } from '@/lib/agent/booking-link'
import { captureAttribution } from '@/lib/attribution'
import { useCartStore } from '@/lib/cart'
import { getExperienceBySlug } from '@/lib/experiences'
import { useTransfersCart } from '@/lib/transfers-cart'
import { addTourToCart } from '@/lib/webmcp-tools'
import { useHydrated } from '@/components/checkout/one-page/useHydrated'

/**
 * /book: where an AI assistant's booking link lands (lib/agent/booking-link).
 *
 * Waits for both carts to load from localStorage first: the tour cart is
 * rehydrated by LayoutShell after mount, and a write before that would be
 * overwritten by the saved cart. Then the link is re-checked (it may be days
 * old), the ride or tour is put in the cart exactly as the assistant
 * validated it, and checkout opens. Checkout prices it from the rate card and
 * the traveller pays there; this page books and charges nothing.
 */

type State =
  | { phase: 'working' }
  | { phase: 'error'; reason: string; fallbackPath: string; fallbackLabel: string }

const FONT = 'var(--font-dm-sans)'

export default function BookHandoff() {
  const router = useRouter()
  const toursLoaded = useHydrated(useCartStore)
  const ridesLoaded = useHydrated(useTransfersCart)
  const started = useRef(false)
  const [state, setState] = useState<State>({ phase: 'working' })

  useEffect(() => {
    if (!toursLoaded || !ridesLoaded || started.current) return
    started.current = true
    const parsed = parseHandoff(new URLSearchParams(window.location.search), new Date())
    if (!parsed.ok) {
      setState({ phase: 'error', reason: parsed.reason, fallbackPath: parsed.fallbackPath, fallbackLabel: parsed.fallbackLabel })
      return
    }
    // Credit the assistant (utm_* on this URL) before the URL changes.
    captureAttribution()
    const h = parsed.handoff
    if (h.kind === 'ride') {
      const quote = buildQuote(h.destinationId, h.tripType, h.passengers)
      if (!quote) {
        setState({ phase: 'error', reason: 'This hotel is quoted by email. Write to contact@mapltours.com with your dates and we will send the fare.', fallbackPath: '/transfers', fallbackLabel: 'Price another hotel' })
        return
      }
      // One ride per checkout: addQuote replaces any ride already in the cart.
      useTransfersCart.getState().addQuote(quote, { fromAirport: h.fromAirport })
      const id = useTransfersCart.getState().items[0]?.id
      if (id) {
        useTransfersCart.getState().updateItem(id, {
          ...(h.arrivalAt ? { arrivalAt: h.arrivalAt } : {}),
          ...(h.arrivalFlight ? { arrivalFlight: h.arrivalFlight } : {}),
          ...(h.departureAt ? { departureAt: h.departureAt } : {}),
          ...(h.departureFlight ? { departureFlight: h.departureFlight } : {}),
        })
      }
      router.replace('/transfers/checkout')
      return
    }
    const exp = getExperienceBySlug(h.slug)
    if (!exp) {
      setState({ phase: 'error', reason: 'That tour is not on our list any more.', fallbackPath: '/explore', fallbackLabel: 'See our tours' })
      return
    }
    // The link is the traveller's whole request: a day is one package or one
    // set of single tours, so start the tour cart from it alone.
    useCartStore.getState().clearCart()
    const added = addTourToCart(useCartStore.getState, exp, h.guests, h.date, h.pickupHotel)
    if (!added.added) {
      setState({ phase: 'error', reason: added.reason ?? `${exp.title} could not be added.`, fallbackPath: `/experience/${h.slug}`, fallbackLabel: 'Book this tour' })
      return
    }
    router.replace('/checkout')
  }, [toursLoaded, ridesLoaded, router])

  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', background: 'var(--bg, #FFFEFB)' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {state.phase === 'working' ? (
          <div role="status" aria-live="polite">
            <span aria-hidden="true" style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid var(--border, rgba(23,22,20,0.12))', borderTopColor: 'var(--text-primary, #171614)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <h1 style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, lineHeight: 1.25, margin: '18px 0 8px', color: 'var(--text-primary, #171614)' }}>Opening your checkout</h1>
            <p style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
              Your booking is filled in. You check it and pay on the next page.
            </p>
            <noscript>
              <p style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.6, marginTop: 16 }}>
                Turn on JavaScript to open your checkout, or <a href="/transfers">price your ride here</a>.
              </p>
            </noscript>
          </div>
        ) : (
          <div role="alert">
            <h1 style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, lineHeight: 1.2, margin: '0 0 12px', color: 'var(--text-primary, #171614)' }}>This booking link needs a fresh look</h1>
            <p style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 28px' }}>{state.reason}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href={state.fallbackPath} className="btn-primary" style={{ textDecoration: 'none', minHeight: 48 }}>
                {state.fallbackLabel}
              </Link>
              <a href="mailto:contact@mapltours.com" className="btn-outline" style={{ textDecoration: 'none', minHeight: 48 }}>
                Email us
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
