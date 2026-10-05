import { useCartStore, type DaySnapshot } from './cart'
import { useTripNotice } from './trip-notice'
import { tripDayLabel } from './reel-feed'
import type { Experience } from './experiences'
import type { TourFit } from './day-route'

export type AddResult = 'added' | 'swapped' | 'blocked' | 'already'

/**
 * Add a tour the same way from every surface (the reel, the home rail, a tour
 * card), so a guest learns one behaviour:
 *
 *   - it fits the day in the cart: it joins the day;
 *   - it cannot (more than an hour's drive from every tour in it): it is
 *     booked in that day's place, keeping the date and party (cart
 *     swapDayFor), never a dead button;
 *   - either way a notice says what happened, names the day it landed on (the
 *     cart dates a first tour two weeks out until the guest picks, and that
 *     should never be silent), and offers Undo.
 *
 * A replayed tap (one made before the page knew the cart) pressed "Add", not
 * "Book this instead", so a replay never replaces anyone's day.
 */
export function addTourToTrip(
  exp: Experience,
  fit: Pick<TourFit, 'allowed'>,
  opts: { placement: 'reel' | 'page'; checkout: boolean; replayed?: boolean; onUndo?: () => void },
): AddResult {
  const store = useCartStore.getState()
  if (store.isInCart(exp.id)) return 'already'
  const notify = useTripNotice.getState().show

  if (fit.allowed) {
    store.addItem(exp)
    const line = useCartStore.getState().items.find((i) => i.id === exp.id)
    if (!line) return 'blocked'
    const day = tripDayLabel(line.date)
    notify({
      text: day ? `Added for ${day}. You can change the day at checkout.` : 'Added to your trip.',
      undo: () => {
        useCartStore.getState().removeItem(exp.id)
        opts.onUndo?.()
      },
      checkout: opts.checkout,
      placement: opts.placement,
    })
    return 'added'
  }

  if (opts.replayed) return 'blocked'
  const snapshot = store.swapDayFor(exp)
  if (!snapshot) return 'already'
  const replaced = snapshot.items.length === 1 ? snapshot.items[0].title : `your ${snapshot.items.length} tours`
  notify({
    text: `Booked in place of ${replaced}.`,
    undo: () => {
      useCartStore.getState().restoreDay(snapshot)
      opts.onUndo?.()
    },
    checkout: opts.checkout,
    placement: opts.placement,
  })
  return 'swapped'
}

/**
 * Add a ready-made day (a package). The cart holds one kind of day, so a
 * package replaces the single tours in it, and any package it shares an
 * activity with (cart addItem). That used to happen without a word: the
 * notice now says what it replaced, and Undo puts the day back exactly as it
 * was, as it does for a tour booked in a day's place.
 */
export function addPackageToTrip(
  pkg: Experience,
  opts: { placement: 'reel' | 'page'; checkout: boolean; onUndo?: () => void },
): AddResult {
  const store = useCartStore.getState()
  if (store.isInCart(pkg.id)) return 'already'
  const snapshot: DaySnapshot = { items: store.items, stops: store.stops }
  store.addItem(pkg)
  const after = useCartStore.getState().items
  const line = after.find((i) => i.id === pkg.id)
  if (!line) return 'blocked'
  const replaced = snapshot.items.filter((i) => !after.some((a) => a.id === i.id))
  const day = tripDayLabel(line.date)
  useTripNotice.getState().show({
    text: replaced.length === 0
      ? (day ? `Added for ${day}. You can change the day at checkout.` : 'Added to your trip.')
      : `Booked in place of ${replaced.length === 1 ? replaced[0].title : `your ${replaced.length} tours`}.`,
    undo: () => {
      useCartStore.getState().restoreDay(snapshot)
      opts.onUndo?.()
    },
    checkout: opts.checkout,
    placement: opts.placement,
  })
  return replaced.length > 0 ? 'swapped' : 'added'
}
