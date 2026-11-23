'use client'

import { useCartStore } from './cart'
import { fitTourToDay, type TourFit } from './day-route'
import { useHydrated } from './use-hydrated'
import type { Experience } from './experiences'

const OPEN: TourFit = { allowed: true, why: null, minutes: null, nearest: null, dayMinutes: null, reason: null }

/**
 * Whether this tour can join the day already in the cart.
 *
 * A day's tours have to be drivable between (lib/day-route, rule 2), and the
 * day with them in, driving included, has to fit in eight hours (rule 4), so
 * the catalog is not uniformly addable once a day has a shape: a Negril tour
 * is a different day from an Ocho Rios one, and a full day has no room for
 * another tour. Every surface with an add button asks this first, because a
 * button that silently does nothing is worse than a button that says why.
 *
 * Before hydration, and for a tour already in the cart, the answer is always
 * yes — the first renders match the server's empty cart, and removing
 * something must never be blocked.
 */
export function useTourFit(exp: Pick<Experience, 'id' | 'title' | 'destination' | 'duration' | 'kind'>): TourFit {
  const items = useCartStore((s) => s.items)
  const stops = useCartStore((s) => s.stops)
  const hydrated = useHydrated()

  if (!hydrated) return OPEN
  if (items.some((i) => i.id === exp.id)) return OPEN

  // Adding a package clears single tours and vice versa, so only the lines
  // that would SURVIVE the add constrain it.
  const kept = items.filter((i) => i.kind === exp.kind)
  return fitTourToDay(exp, { items: kept, stops })
}
