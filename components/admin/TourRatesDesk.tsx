'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tourOperatorCost, tourPrice, type TourPricing } from '@/lib/experiences'
import { describeRateCard, parseRateCard, rateCardChanges, sameCard, type RateCard, type RateField } from '@/lib/tour-rates'
import { describeParties, guestPriceAt, partiesMoved, placesCompared } from '@/lib/tour-rate-impact'
import { TOUR_ZONES, TOUR_ZONE_LABEL, type TourZone } from '@/lib/tour-zones'

/**
 * Tour prices desk (/admin/tour-rates): Collin's rate for every tour, with
 * what a guest pays worked out live by the same functions checkout charges
 * with. A save goes to /api/admin/tour-rates, which validates it again,
 * stores it with its change-log row and starts the deploy that publishes it.
 *
 * Styles: the .adm classes in app/globals.css (one scoped token set; this file
 * carries no colours or sizes of its own).
 */

export interface TourRateView {
  id: number
  title: string
  kind: 'single' | 'package'
  place: string
  /** What this deploy charges. */
  live: RateCard
  /** What is saved, when the tour has been edited here. */
  saved: RateCard | null
  savedAt: string | null
  savedBy: string | null
  /** The catalog's own card, which "back to the default" restores. */
  fallback: RateCard
}

export interface RateChangeView {
  id: number
  experienceId: number
  tourTitle: string
  action: 'save' | 'reset'
  before: RateCard | null
  after: RateCard | null
  by: string | null
  at: string
}

type Kind = 'group' | 'per_person' | 'area'
interface Draft {
  kind: Kind
  baseRate: string
  tierMax: string
  extraPerPerson: string
  perPersonAddon: string
  zones: Record<TourZone, string>
  minGuests: string
}

const BADGE = {
  default: { cls: 'adm-badge--default', label: 'Default' },
  live: { cls: 'adm-badge--live', label: 'Edited, live' },
  publishing: { cls: 'adm-badge--publishing', label: 'Publishing' },
} as const

const KINDS: { value: Kind; title: string; detail: string }[] = [
  { value: 'group', title: 'One price for the group', detail: 'A flat rate for up to a set number of people, then a rate per person for the whole group.' },
  { value: 'per_person', title: 'Per person', detail: 'A rate for each person, and a lower one from a set group size if Collin gives one.' },
  { value: 'area', title: 'By pickup area', detail: 'A flat rate for up to a set number of people that depends on where we pick the guests up.' },
]

const PARTIES = [1, 2, 3, 4, 5, 6, 8]

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`
const amount = (n: number | undefined) => (n === undefined ? '' : String(n))
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/**
 * Toronto time, named: the owner's clock. A fixed zone, because this
 * component renders on the server (UTC) and again in the browser, and two
 * different clocks would not hydrate to the same text.
 */
function when(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' Toronto time'
  } catch { return iso }
}

/** The time alone, in the same zone: "4:20 PM". */
function clock(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', timeStyle: 'short' }) } catch { return '' }
}

/**
 * Leaving takes as long as arriving (160ms, .adm-leave), so a closing panel
 * fades out instead of vanishing; at once for anyone who asked for less motion.
 */
function useLeave(): [boolean, (then: () => void) => void] {
  const [leaving, setLeaving] = useState(false)
  const leave = (then: () => void) => {
    if (leaving) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { then(); return }
    setLeaving(true)
    window.setTimeout(() => { setLeaving(false); then() }, 160)
  }
  return [leaving, leave]
}

/** The desk at a glance: "20 tours: 1 edited, 1 publishing, 18 on the default". */
function overview(tours: TourRateView[]): string {
  const count = { default: 0, live: 0, publishing: 0 }
  for (const t of tours) count[statusOf(t)]++
  const parts = [
    count.live ? `${count.live} edited` : null,
    count.publishing ? `${count.publishing} publishing` : null,
    count.default ? `${count.default} on the default` : null,
  ].filter(Boolean)
  return `${tours.length} tours: ${parts.join(', ')}.`
}

function statusOf(t: TourRateView): keyof typeof BADGE {
  if (!sameCard(t.saved ?? t.fallback, t.live)) return 'publishing'
  return t.saved ? 'live' : 'default'
}

function draftOf(card: RateCard): Draft {
  const p = card.pricing
  const zoned = !!p.zoneRates && Object.keys(p.zoneRates).length > 0
  return {
    kind: zoned ? 'area' : p.mode,
    baseRate: amount(p.baseRate),
    tierMax: String(p.tierMax),
    extraPerPerson: amount(p.extraPerPerson),
    perPersonAddon: p.perPersonAddon ? amount(p.perPersonAddon) : '',
    zones: Object.fromEntries(TOUR_ZONES.map((z) => [z, amount(p.zoneRates?.[z])])) as Record<TourZone, string>,
    minGuests: String(card.minGuests),
  }
}

/** The draft as a card for parseRateCard, the same check the server and every deploy run. */
function rawCard(d: Draft): unknown {
  const pricing: Record<string, unknown> = {
    mode: d.kind === 'per_person' ? 'per_person' : 'group',
    tierMax: d.tierMax.trim(),
    extraPerPerson: d.extraPerPerson.trim(),
  }
  if (d.kind === 'area') pricing.zoneRates = Object.fromEntries(TOUR_ZONES.map((z) => [z, d.zones[z].trim()]))
  else pricing.baseRate = d.baseRate.trim()
  if (d.perPersonAddon.trim()) pricing.perPersonAddon = d.perPersonAddon.trim()
  return { pricing, minGuests: d.minGuests.trim() }
}

/**
 * A card in full: the area rates as aligned label and amount rows, so one
 * changed number is found by its place; a card with one price everywhere is
 * short enough as a sentence.
 */
function RateSummary({ card }: { card: RateCard }) {
  const p = card.pricing
  const zones = TOUR_ZONES.filter((z) => typeof p.zoneRates?.[z] === 'number')
  if (!zones.length) return <p>{describeRateCard(card)}</p>
  const rest = [
    `Each extra person ${usd(p.extraPerPerson)}`,
    p.perPersonAddon ? `Added for every person ${usd(p.perPersonAddon)}` : null,
    card.minGuests > 1 ? `Smallest party ${people(card.minGuests)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div>
      <p>By pickup area, for {p.tierMax === 1 ? '1 person' : `1 to ${p.tierMax} people`}:</p>
      <dl className="adm-rates">
        {zones.map((z) => (
          <div key={z} className="adm-rate">
            <dt>{TOUR_ZONE_LABEL[z]}</dt>
            <dd>{usd(p.zoneRates![z]!)}</dd>
          </div>
        ))}
      </dl>
      <p>{rest}.</p>
    </div>
  )
}

/** Only what moved between two cards, "Negril $420 (was $400)"; the whole new card when it is priced another way. */
function RateChanges({ before, after }: { before: RateCard; after: RateCard }) {
  const lines = rateCardChanges(before, after)
  if (lines === null) return (<><p>Priced a new way:</p><RateSummary card={after} /></>)
  if (!lines.length) return <p>No change to the rates.</p>
  return (
    <ul className="adm-changes">
      {lines.map((l) => (
        <li key={l.label} className="adm-change">
          <span>{l.label}</span>
          <span className="adm-change-value"><b>{l.now}</b> <span className="adm-was">(was {lowerFirst(l.was)})</span></span>
        </li>
      ))}
    </ul>
  )
}

/** One table for every price list on the desk: a label column and two money columns. */
function MoneyTable({ head, rows, strong, caption, freshKey }: {
  head: [string, string, string]
  rows: { key: string; label: string; a: string; b: string }[]
  /** The column that carries the number to read: the guest's price, or the new one. */
  strong: 'a' | 'b'
  caption: string
  /** Changing it fades the rows in, so a new set of numbers is seen to change. */
  freshKey: number
}) {
  const cls = (col: 'a' | 'b') => (col === strong ? 'adm-num adm-strong' : 'adm-num adm-muted')
  return (
    <table className="adm-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head[0]}</th>
          <th scope="col" className="adm-num">{head[1]}</th>
          <th scope="col" className="adm-num">{head[2]}</th>
        </tr>
      </thead>
      <tbody key={freshKey} className="adm-rows">
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{r.label}</th>
            <td className={cls('a')}>{r.a}</td>
            <td className={cls('b')}>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The group sizes a price can be shown for, as one row of chips. */
function PartyChips({ name, party, onParty }: { name: string; party: number; onParty: (n: number) => void }) {
  return (
    <fieldset className="adm-fieldset">
      <legend className="adm-legend">Group size</legend>
      <div className="adm-chips">
        {PARTIES.map((n) => (
          <label key={n} className={party === n ? 'adm-chip is-on' : 'adm-chip'}>
            <input type="radio" name={name} value={n} checked={party === n} onChange={() => onParty(n)} aria-label={people(n)} />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * What the change does to guests: every group size whose price moves, and,
 * for the group size picked here, each place whose guest price moves, old to
 * new. The review opens on a group size the change moves, so the chips and
 * the table always agree. The number the owner signs off on is the guest's.
 */
function GuestImpact({ before, after, party, onParty, name }: {
  before: RateCard
  after: RateCard
  party: number
  onParty: (n: number) => void
  name: string
}) {
  const moved = partiesMoved(before, after)
  if (!moved.length) {
    return (
      <div className="adm-impact">
        <h5 className="adm-h5">Guest prices</h5>
        <p className="adm-help">No change for any group size.</p>
      </div>
    )
  }
  const places = placesCompared(before, after)
  const flat = places.length === 1 && places[0] === null
  const money = (v: number | null) => (v === null ? 'Not sold online' : usd(v))
  const rows = places
    .map((z) => ({ z, was: guestPriceAt(before, party, z), now: guestPriceAt(after, party, z) }))
    .filter((r) => r.was !== r.now)
    .map((r) => ({ key: r.z ?? 'all', label: r.z ? TOUR_ZONE_LABEL[r.z] : flat ? people(party) : 'Anywhere else', a: money(r.was), b: money(r.now) }))
  return (
    <div className="adm-impact">
      <h5 className="adm-h5">Guest prices</h5>
      <p className="adm-help">Changes for {describeParties(moved)}.</p>
      <PartyChips name={name} party={party} onParty={onParty} />
      {rows.length ? (
        <MoneyTable head={[flat ? 'Group' : 'Pickup area', 'Was', 'New']} rows={rows} strong="b" caption={`Guest prices for ${people(party)}, before and after`} freshKey={party} />
      ) : (
        <p className="adm-help">Nothing changes for {people(party)}.</p>
      )}
    </div>
  )
}

/** What a guest pays and what Collin gets for one party, from every area for a card priced by area. */
function previewRows(p: TourPricing, party: number): { area: string | null; guest: number; collin: number }[] {
  const zones = TOUR_ZONES.filter((z) => typeof p.zoneRates?.[z] === 'number')
  if (zones.length) return zones.map((z) => ({ area: TOUR_ZONE_LABEL[z], guest: tourPrice(p, party, z), collin: tourOperatorCost(p, party, z) }))
  return [{ area: null, guest: tourPrice(p, party), collin: tourOperatorCost(p, party) }]
}

/** The two cards side by side, for anyone who wants to check every line. */
function BothCards({ before, after, beforeLabel, afterLabel }: { before: RateCard; after: RateCard; beforeLabel: string; afterLabel: string }) {
  return (
    <details className="adm-details">
      <summary>Both cards in full</summary>
      <div className="adm-compare">
        <div><span className="adm-block-label">{beforeLabel}</span><RateSummary card={before} /></div>
        <div><span className="adm-block-label">{afterLabel}</span><RateSummary card={after} /></div>
      </div>
    </details>
  )
}

export default function TourRatesDesk({ tours, changes, publishedAt, canPublish, loadError }: {
  tours: TourRateView[]
  changes: RateChangeView[]
  publishedAt: string | null
  canPublish: boolean
  loadError: string | null
}) {
  const router = useRouter()
  const [notice, setNotice] = useState<string | null>(null)
  const [checking, startCheck] = useTransition()
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [restore, setRestore] = useState<Restore | null>(null)
  const restores = useRef(0)
  const publishing = tours.filter((t) => statusOf(t) === 'publishing')
  const singles = tours.filter((t) => t.kind === 'single')
  const packages = tours.filter((t) => t.kind === 'package')

  // A check that finds the deploy done says so; one that does not says when it looked.
  const wasPublishing = useRef(publishing.length)
  const wasChecking = useRef(false)
  useEffect(() => {
    if (wasChecking.current && !checking) setCheckedAt(new Date().toISOString())
    wasChecking.current = checking
  }, [checking])
  useEffect(() => {
    if (wasPublishing.current > 0 && publishing.length === 0) {
      setNotice('Published. The site and checkout now charge the new prices.')
      setCheckedAt(null)
    }
    wasPublishing.current = publishing.length
  }, [publishing.length])

  const saved = (msg: string) => {
    setNotice(msg)
    setCheckedAt(null)
    router.refresh()
  }

  return (
    <div className="adm">
      <h1 className="adm-h1">Tour prices</h1>
      <p className="adm-lead">
        Collin&rsquo;s rate for each tour, and exactly what guests pay once our margin and card fees are added.
        Saving publishes it: the tour page and checkout change together in about 3 minutes.
      </p>
      <p className="adm-meta">
        {publishedAt ? `Prices on the site were published ${when(publishedAt)}.` : 'The site is on the catalog’s default rates.'}
      </p>
      <p className="adm-overview">{overview(tours)}</p>

      <div aria-live="polite" role="status">
        {notice && <p className="adm-note adm-note--ok adm-enter">{notice}</p>}
      </div>
      {loadError && <p role="alert" className="adm-note adm-note--bad">{loadError}</p>}
      {!canPublish && !loadError && (
        <p className="adm-note adm-note--warn">
          Saving stores the rate, but this site cannot start a deploy by itself yet, so it reaches the site with the next deploy.
        </p>
      )}
      {publishing.length > 0 && (
        <div className="adm-note adm-note--warn adm-banner">
          <p className="adm-banner-text">
            <span className="adm-dot" aria-hidden="true" />
            <b>Publishing</b> {publishing.map((t) => t.title).join(', ')}. Saved changes reach the site in about 3 minutes.
            <span aria-live="polite">{checkedAt && !checking ? ` Still publishing at ${clock(checkedAt)}.` : ''}</span>
          </p>
          <button
            type="button" className="adm-btn" aria-disabled={checking || undefined} aria-busy={checking || undefined}
            onClick={() => { if (!checking) startCheck(() => router.refresh()) }}
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      )}

      <TourGroup heading="Tours" tours={singles} onSaved={saved} locked={!!loadError} canPublish={canPublish} restore={restore} />
      <TourGroup heading="Day packages" tours={packages} onSaved={saved} locked={!!loadError} canPublish={canPublish} restore={restore} />

      <section aria-labelledby="rate-history" className="adm-section adm-section--history">
        <h2 id="rate-history" className="adm-h2">Recent changes</h2>
        {changes.length === 0 ? (
          <p className="adm-lead">No rate has been changed here yet. Every save and every reset will be listed, with who made it.</p>
        ) : (
          <ol className="adm-list">
            {changes.map((c) => (
              <li key={c.id} className="adm-history-item">
                <p className="adm-history-title">{c.tourTitle}{c.action === 'reset' ? ', back to the default' : ''}</p>
                <p className="adm-meta">{when(c.at)}{c.by ? ` · ${c.by}` : ''}</p>
                <div className="adm-block">
                  {c.before && c.after ? <RateChanges before={c.before} after={c.after} /> : c.after ? <RateSummary card={c.after} /> : <p>Not recorded</p>}
                </div>
                {c.before && c.after && <BothCards before={c.before} after={c.after} beforeLabel="Was" afterLabel="Now" />}
                {c.before && !loadError && tours.some((t) => t.id === c.experienceId) && (
                  <button
                    type="button" className="adm-link adm-link--flush" aria-label={`Restore the old rate, ${c.tourTitle}`}
                    onClick={() => setRestore({ id: c.experienceId, card: c.before!, n: ++restores.current })}
                  >
                    Restore the old rate
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/** A past card to edit from: history's "Restore the old rate". `n` makes each press a new request. */
interface Restore { id: number; card: RateCard; n: number }

function TourGroup({ heading, tours, onSaved, locked, canPublish, restore }: {
  heading: string
  tours: TourRateView[]
  onSaved: (msg: string) => void
  locked: boolean
  canPublish: boolean
  restore: Restore | null
}) {
  const id = useId()
  if (!tours.length) return null
  return (
    <section aria-labelledby={id} className="adm-section">
      <h2 id={id} className="adm-h2">{heading}</h2>
      <ul className="adm-list">
        {tours.map((t) => <TourRow key={t.id} tour={t} onSaved={onSaved} locked={locked} canPublish={canPublish} restore={restore?.id === t.id ? restore : null} />)}
      </ul>
    </section>
  )
}

function TourRow({ tour, onSaved, locked, canPublish, restore }: {
  tour: TourRateView
  onSaved: (msg: string) => void
  locked: boolean
  canPublish: boolean
  restore: Restore | null
}) {
  // Each row keeps its own editor, so opening a second tour never throws
  // away what was typed in the first.
  const [open, setOpen] = useState(false)
  const [closedOnce, setClosedOnce] = useState(false)
  // A card from history to start from; it stays the editor's starting draft
  // until the editor closes, and opens a fresh editor each time it is asked for.
  const [seed, setSeed] = useState<Restore | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false
      editButton.current?.focus()
    }
  }, [open])
  useEffect(() => {
    if (restore && !locked) { setSeed(restore); setOpen(true) }
  }, [restore, locked])
  const close = () => { returnFocus.current = true; setClosedOnce(true); setSeed(null); setOpen(false) }

  const s = statusOf(tour)
  const target = tour.saved ?? tour.fallback
  // A status that changes while the page is open (a publish landing) arrives
  // with the enter motion; the desk's notice announces it.
  const [statusChanged, setStatusChanged] = useState(false)
  const lastStatus = useRef(s)
  useEffect(() => {
    if (lastStatus.current !== s) { lastStatus.current = s; setStatusChanged(true) }
  }, [s])
  return (
    <li className="adm-card">
      <div className="adm-card-in">
        <div className="adm-card-head">
          <div className="adm-card-main">
            <div className="adm-title-row">
              <h3 className="adm-h3">{tour.title}</h3>
              <span key={s} className={`adm-badge ${BADGE[s].cls}${statusChanged ? ' adm-enter' : ''}`}>
                {s === 'publishing' && <span className="adm-dot" aria-hidden="true" />}
                {BADGE[s].label}
              </span>
            </div>
            <p className="adm-meta">{tour.place}</p>
            <div className="adm-block">
              <span className="adm-block-label">On the site</span>
              <RateSummary card={tour.live} />
            </div>
            {s === 'publishing' && (
              <div className="adm-block adm-block--warn">
                <span className="adm-block-label">Saved, publishing</span>
                <RateChanges before={tour.live} after={target} />
              </div>
            )}
            {tour.saved && tour.savedAt && <p className="adm-meta">Edited {when(tour.savedAt)}{tour.savedBy ? ` by ${tour.savedBy}` : ''}</p>}
          </div>
          {!open && (
            <button ref={editButton} type="button" className={closedOnce ? 'adm-btn adm-enter' : 'adm-btn'} onClick={() => setOpen(true)} disabled={locked} aria-label={`Edit price, ${tour.title}`}>
              Edit price
            </button>
          )}
        </div>
        {open && (
          <RateEditor
            key={seed?.n ?? 'edit'} tour={tour} start={target} initial={seed?.card} canPublish={canPublish}
            onClose={close} onSaved={(msg) => { close(); onSaved(msg) }}
          />
        )}
      </div>
    </li>
  )
}

function RateEditor({ tour, start, initial, onClose, onSaved, canPublish }: {
  tour: TourRateView
  start: RateCard
  /** A card to start the draft from instead of the one in force (history's restore). */
  initial?: RateCard
  onClose: () => void
  onSaved: (msg: string) => void
  canPublish: boolean
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial ?? start))
  const [returned, setReturned] = useState(false)
  const [editorLeaving, leaveEditor] = useLeave()
  const [askLeaving, leaveAsk] = useLeave()
  const [party, setParty] = useState(2)
  const [step, setStep] = useState<'edit' | 'review' | 'reset'>('edit')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const firstField = useRef<HTMLInputElement>(null)
  const askHeading = useRef<HTMLHeadingElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)
  const resetButton = useRef<HTMLButtonElement>(null)
  const lastStep = useRef(step)
  const uid = useId()

  const parsed = useMemo(() => parseRateCard(rawCard(draft)), [draft])
  const unchanged = parsed.ok && sameCard(parsed.card, start)

  useEffect(() => { firstField.current?.focus() }, [])
  // Focus follows the step: into the question when it opens, back to the
  // button that opened it when it closes.
  useEffect(() => {
    if (step !== 'edit') askHeading.current?.focus()
    else if (lastStep.current !== 'edit') (lastStep.current === 'reset' ? resetButton : reviewButton).current?.focus()
    lastStep.current = step
  }, [step])
  // A reload or a closed tab asks first while an edit is not saved.
  useEffect(() => {
    if (unchanged) return
    const hold = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [unchanged])

  // The review replaces the form, so what is reviewed is what gets saved and
  // nothing can change under it until "Keep editing". The group size stays
  // free during a review; it only changes which prices are shown.
  const set = (k: keyof Omit<Draft, 'zones' | 'kind'>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerError(null)
    setDraft((d) => ({ ...d, [k]: e.target.value }))
  }
  const setZone = (z: TourZone) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerError(null)
    setDraft((d) => ({ ...d, zones: { ...d.zones, [z]: e.target.value } }))
  }
  const setKind = (k: Kind) => {
    setServerError(null)
    setDraft((d) => {
      const next = { ...d, kind: k }
      // Switching to areas starts every area at the current group rate, so
      // nothing is lost and nothing is sold from an area by accident at $0.
      if (k === 'area' && TOUR_ZONES.every((z) => !d.zones[z].trim()) && d.baseRate.trim()) {
        next.zones = Object.fromEntries(TOUR_ZONES.map((z) => [z, d.baseRate])) as Record<TourZone, string>
      }
      if (k !== 'area' && !d.baseRate.trim()) {
        const rates = TOUR_ZONES.map((z) => Number(d.zones[z])).filter((n) => Number.isFinite(n) && n > 0)
        if (rates.length) next.baseRate = String(Math.min(...rates))
      }
      return next
    })
  }

  async function send(method: 'POST' | 'DELETE') {
    setBusy(true); setServerError(null)
    // A save that worked keeps "Saving…" while the editor fades out.
    let closing = false
    try {
      const res = await fetch('/api/admin/tour-rates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'POST' ? { experienceId: tour.id, card: rawCard(draft) } : { experienceId: tour.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; unchanged?: boolean; published?: boolean }
      // A session can lapse while a card is open: say so, and keep the edit.
      if (res.status === 401) { setServerError('You are signed out, so nothing was saved. Sign in again in another tab, then save; your edit is still here.'); return }
      if (res.status === 403) { setServerError('This account cannot change prices, so nothing was saved.'); return }
      if (!res.ok || !data.ok) { setServerError(data.error ?? 'That did not save. Nothing was changed. Try again.'); return }
      closing = true
      if (data.unchanged) { leaveEditor(() => onSaved(`${tour.title} already had that price, so nothing changed.`)); return }
      const what = method === 'DELETE' ? `${tour.title} is back on its default price` : `Saved the new price for ${tour.title}`
      const msg = data.published
        ? `${what}. The site is publishing it now; it is live in about 3 minutes.`
        : `${what}. It reaches the site with the next deploy${canPublish ? ' (the deploy could not be started just now)' : ''}.`
      leaveEditor(() => onSaved(msg))
    } catch {
      setServerError('The connection dropped before the answer came back. Reload the page to see whether it saved.')
    } finally {
      if (!closing) setBusy(false)
    }
  }

  const err = !parsed.ok ? parsed.error : null
  const errField: RateField | undefined = !parsed.ok ? parsed.field : undefined
  const errId = `${uid}-error`
  // The field a refusal is about is marked and points at the sentence.
  const flag = (bad: boolean) => (bad ? { 'aria-invalid': true as const, 'aria-describedby': errId } : {})
  const field = (k: keyof Omit<Draft, 'zones' | 'kind'>, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => ({
    value: draft[k], onChange: set(k), inputMode: 'decimal' as const, autoComplete: 'off', className: 'adm-input',
    ...flag(errField === k), ...extra,
  })
  const rows = parsed.ok ? previewRows(parsed.card.pricing, party) : []
  // The review opens on a group size the change moves (the smallest one,
  // among the chips where possible), so its chips and its table agree.
  const openAsk = (next: 'review' | 'reset', after: RateCard) => {
    const moved = partiesMoved(start, after)
    if (moved.length && !moved.includes(party)) setParty(moved.find((n) => PARTIES.includes(n)) ?? moved[0])
    setStep(next)
  }
  const ask = parsed.ok && step === 'review'
    ? { question: `Change the price of ${tour.title}?`, after: parsed.card, confirm: canPublish ? 'Save and publish' : 'Save', cancel: 'Keep editing', method: 'POST' as const }
    : step === 'reset'
      ? { question: `Put ${tour.title} back on its default price?`, after: tour.fallback, confirm: canPublish ? 'Use the default and publish' : 'Use the default', cancel: 'Cancel', method: 'DELETE' as const }
      : null

  return (
    <div className={editorLeaving ? 'adm-editor adm-leave' : 'adm-editor adm-enter'}>
      {step === 'edit' && (
        <div className={returned ? 'adm-fields adm-enter' : 'adm-fields'}>
          <fieldset className="adm-fieldset">
            <legend className="adm-legend">How Collin charges for it</legend>
            <div className="adm-grid3">
              {KINDS.map((k) => {
                const on = draft.kind === k.value
                return (
                  <label key={k.value} className={on ? 'adm-choice is-on' : 'adm-choice'}>
                    <input type="radio" name={`${uid}-kind`} value={k.value} checked={on} onChange={() => setKind(k.value)} />
                    <span>
                      <span className="adm-choice-title">{k.title}</span>
                      <span className="adm-choice-detail">{k.detail}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="adm-grid3">
            {draft.kind !== 'area' && (
              <div>
                <label htmlFor={`${uid}-base`} className="adm-label">{draft.kind === 'group' ? 'Rate for the group ($)' : 'Rate per person ($)'}</label>
                <input id={`${uid}-base`} ref={firstField} {...field('baseRate')} />
              </div>
            )}
            <div>
              <label htmlFor={`${uid}-tier`} className="adm-label">{draft.kind === 'per_person' ? 'That rate is for up to (people)' : 'Covers up to (people)'}</label>
              <input id={`${uid}-tier`} ref={draft.kind === 'area' ? firstField : undefined} {...field('tierMax', { inputMode: 'numeric' })} />
            </div>
            <div>
              <label htmlFor={`${uid}-extra`} className="adm-label">{draft.kind === 'area' ? 'Each extra person ($)' : 'Bigger groups, per person ($)'}</label>
              <input id={`${uid}-extra`} {...field('extraPerPerson')} />
              <p className="adm-help">{draft.kind === 'area' ? 'Added for each guest past the number above.' : 'Once the group is bigger than that, every guest pays this.'}</p>
            </div>
          </div>

          {draft.kind === 'area' && (
            <fieldset className="adm-fieldset">
              <legend className="adm-legend">Rate by pickup area ($)</legend>
              <p className="adm-help">Leave an area empty to stop selling the tour online from there; guests there are asked to write for a price.</p>
              <div className="adm-grid3 adm-grid3--areas">
                {TOUR_ZONES.map((z) => (
                  <div key={z}>
                    <label htmlFor={`${uid}-zone-${z}`} className="adm-label adm-label--area">{TOUR_ZONE_LABEL[z]}</label>
                    <input
                      id={`${uid}-zone-${z}`} value={draft.zones[z]} onChange={setZone(z)} inputMode="decimal" autoComplete="off"
                      placeholder="Not sold online" className="adm-input" {...flag(errField === z || errField === 'zoneRates')}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="adm-grid3">
            <div>
              <label htmlFor={`${uid}-addon`} className="adm-label">Added for every person ($, optional)</label>
              <input id={`${uid}-addon`} {...field('perPersonAddon')} placeholder="None" />
              <p className="adm-help">A cost each guest adds on top, such as the second entry fee on a two-stop day.</p>
            </div>
            <div>
              <label htmlFor={`${uid}-min`} className="adm-label">Smallest party</label>
              <input id={`${uid}-min`} {...field('minGuests', { inputMode: 'numeric' })} />
              <p className="adm-help">1 means anyone. Tour emails never offer it to a smaller party.</p>
            </div>
          </div>

          {err && <p id={errId} role="alert" className="adm-error">{err}</p>}
        </div>
      )}

      {parsed.ok && step === 'edit' && (
        <section aria-labelledby={`${uid}-preview`} className={returned ? 'adm-panel adm-enter' : 'adm-panel'}>
          <h4 id={`${uid}-preview`} className="adm-h4">What guests pay</h4>
          <PartyChips name={`${uid}-party`} party={party} onParty={setParty} />
          {parsed.card.minGuests > party && (
            <p className="adm-help adm-help--warn">Below the smallest party: tour emails will not offer it to {party === 1 ? 'one person' : people(party)}.</p>
          )}
          <MoneyTable
            head={[rows[0]?.area ? 'Pickup area' : 'Group', 'Guest pays', 'Collin gets']} strong="a" freshKey={party}
            caption={`What guests pay and what Collin gets for ${people(party)}`}
            rows={rows.map((r) => ({ key: r.area ?? 'all', label: r.area ?? people(party), a: usd(r.guest), b: usd(r.collin) }))}
          />
        </section>
      )}

      {serverError && <p role="alert" className="adm-error">{serverError}</p>}

      {ask ? (
        <section aria-labelledby={`${uid}-ask`} className={askLeaving ? 'adm-ask adm-leave' : 'adm-ask adm-enter'}>
          <h4 id={`${uid}-ask`} ref={askHeading} tabIndex={-1} className="adm-h4 adm-h4--ask">{ask.question}</h4>
          <div className="adm-block">
            <span className="adm-block-label">Collin&rsquo;s rate</span>
            <RateChanges before={start} after={ask.after} />
          </div>
          <GuestImpact before={start} after={ask.after} party={party} onParty={setParty} name={`${uid}-party`} />
          <BothCards before={start} after={ask.after} beforeLabel="Now" afterLabel="New" />
          <p className="adm-help adm-help--soft">
            {canPublish
              ? 'The site and checkout switch to the new price together when the deploy goes live, in about 3 minutes.'
              : 'It is stored now and reaches the site and checkout together with the next deploy.'}{' '}
            Bookings already paid keep their price.
          </p>
          <div className="adm-actions">
            {/* aria-disabled, not disabled: a button that disables under the
                keyboard drops focus to the page body mid-save. */}
            <button
              type="button" className="adm-btn adm-btn--primary" aria-disabled={busy || undefined} aria-busy={busy || undefined}
              onClick={() => { if (!busy) void send(ask.method) }}
            >
              {busy ? 'Saving…' : ask.confirm}
            </button>
            <button type="button" className="adm-btn" aria-disabled={busy || undefined} onClick={() => { if (!busy) leaveAsk(() => { setReturned(true); setStep('edit') }) }}>
              {ask.cancel}
            </button>
          </div>
        </section>
      ) : (
        <div className={returned ? 'adm-actions adm-enter' : 'adm-actions'}>
          {/* aria-disabled with its reason, not disabled: the button stays in
              the tab order and says why it cannot be used yet. */}
          <button
            ref={reviewButton} type="button" className="adm-btn adm-btn--primary"
            aria-disabled={!parsed.ok || unchanged || undefined}
            aria-describedby={!parsed.ok ? errId : unchanged ? `${uid}-same` : undefined}
            onClick={() => { if (parsed.ok && !unchanged) openAsk('review', parsed.card) }}
          >
            Review the change
          </button>
          <button type="button" className="adm-btn" onClick={() => leaveEditor(onClose)}>Cancel</button>
          {tour.saved && (
            <button ref={resetButton} type="button" className="adm-link" onClick={() => openAsk('reset', tour.fallback)}>Back to the default</button>
          )}
          {unchanged && parsed.ok && <span id={`${uid}-same`} className="adm-status">No change yet.</span>}
        </div>
      )}
    </div>
  )
}
