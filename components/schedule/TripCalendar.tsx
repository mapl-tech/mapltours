'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Arrow from '@/components/ui/Arrow'
import {
  clock, clockFromHHMM, daySummary, eventsByDay, eventWhen, jamaicaDay, longDay, monthLabel, monthOf, monthWeeks,
  nextUp, sameDayOthers, shiftMonth, shortDay, untilLabel, type ScheduleEvent,
} from '@/lib/trip-schedule'

/**
 * The trip calendar and the "next up" card, for the admin's Bookings screen
 * and the driver's portal (owner, Nov 13 2026: "it needs to be very clear
 * when there is an upcoming ride, maybe have a calendar available for admins
 * and the driver").
 *
 * Both read lib/trip-schedule's flat list of events, where each ride LEG and
 * each tour day is its own event, so a drive back to the airport a week after
 * the guest landed has its own day on the grid.
 *
 * The grid is a real table: a screen reader gets each day's weekday from its
 * column header, and each day with trips is a button whose name says the whole
 * date and what it holds. A ride is a filled dot and a tour a ring, so the two
 * differ by shape, not by colour alone. It opens on the next day that has a
 * trip, already selected. Styles: the .cal block in app/globals.css.
 */

const WEEKDAYS = [['Sunday', 'S'], ['Monday', 'M'], ['Tuesday', 'T'], ['Wednesday', 'W'], ['Thursday', 'T'], ['Friday', 'F'], ['Saturday', 'S']] as const

/** A drive's two ends with the drawn arrow between them, or a tour's name. */
function What({ e }: { e: ScheduleEvent }) {
  if (e.kind === 'tour') return <>{e.title}</>
  return <>{e.from}<Arrow place="between" />{e.to}</>
}

/** "Today", "Tomorrow" or "Sat, Nov 14". */
function dayWord(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === jamaicaDay(Date.parse(`${today}T12:00:00Z`) + 24 * 3_600_000 + 5 * 3_600_000)) return 'Tomorrow'
  return shortDay(day, today.slice(0, 4))
}

/** Ticks once a minute so "in 40 min" and the Jamaica day stay true on a screen left open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/**
 * The one fact that matters most, said first: the next ride or tour, when it
 * is, who it is for, and how far off. `action` is the page's one filled
 * button for it (the admin's "Manage dispatch", say).
 */
export function NextUp({ events, action, empty = 'No upcoming rides or tours. New bookings show here as they come in.', audience = 'admin' }: {
  events: ScheduleEvent[]
  action?: (e: ScheduleEvent) => React.ReactNode
  empty?: string
  audience?: 'admin' | 'driver'
}) {
  const now = useNow()
  const today = jamaicaDay(now)
  const next = useMemo(() => nextUp(events, now), [events, now])
  if (!next) return <p className="cal-next cal-next--none">{empty}</p>
  const others = sameDayOthers(events, next).filter((e) => e.kind === 'tour' || (e.at ?? '') > (next.at ?? ''))
  const isTour = next.kind === 'tour'
  const time = isTour ? clockFromHHMM(next.pickupTime) : clock(next.at)
  return (
    <section className="cal-next" aria-label={isTour ? 'Next tour' : 'Next ride'}>
      <div className="cal-next-top">
        <p className="cal-next-kicker">
          {isTour ? 'Next tour' : `Next ride · ${next.kind === 'arrival' ? 'airport to hotel' : 'hotel to airport'}`}
        </p>
        {/* The server and the browser compute this a moment apart. */}
        <span className="cal-next-chip" suppressHydrationWarning>{untilLabel(next, now)}</span>
      </div>
      <p className="cal-next-when" suppressHydrationWarning>
        {dayWord(next.day, today)}{time ? <> · <span className="cal-nowrap">{time}</span></> : null}
        <span className="visually-hidden"> Jamaica time</span>
      </p>
      <p className="cal-next-who">
        {isTour
          ? <>{next.guest} · <What e={next} /></>
          : <>{next.guest} {next.kind === 'arrival' ? 'lands' : audience === 'driver' ? 'is picked up' : 'is picked up at the hotel'} · <What e={next} /></>}
      </p>
      <p className="cal-next-meta">
        {[next.party, next.flight ? `flight ${next.flight}` : null, next.ref, 'Jamaica time'].filter(Boolean).join(' · ')}
      </p>
      {others.length > 0 && (
        <p className="cal-next-also">
          Also {next.day === today ? 'today' : 'that day'}: {others.slice(0, 2).map((e) => `${e.guest} (${eventWhen(e).toLowerCase()})`).join(', ')}{others.length > 2 ? ` and ${others.length - 2} more` : ''}.
        </p>
      )}
      {action ? <div className="cal-next-act">{action(next)}</div> : null}
    </section>
  )
}

export default function TripCalendar({ events, onOpen, openWord = 'Open booking', heading = 'Calendar' }: {
  events: ScheduleEvent[]
  /** Opens the booking an event belongs to. Without it the day's trips are plain rows. */
  onOpen?: (e: ScheduleEvent) => void
  /** What opening does, for the row's name: "Open booking", "Open trip". */
  openWord?: string
  heading?: string
}) {
  const uid = useId()
  const now = useNow()
  const today = jamaicaDay(now)
  const thisYear = today.slice(0, 4)
  const byDay = useMemo(() => eventsByDay(events), [events])
  // Opens on the next day that has a trip (the default most people want), or today.
  const firstAhead = useMemo(() => Array.from(byDay.keys()).sort().find((d) => d >= today) ?? null, [byDay, today])
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? firstAhead ?? today
  const [shownMonth, setShownMonth] = useState<string | null>(null)
  const month = shownMonth ?? monthOf(selected)
  const weeks = useMemo(() => monthWeeks(month), [month])
  const dayList = byDay.get(selected) ?? []
  const inMonthCount = useMemo(() => events.filter((e) => monthOf(e.day) === month).length, [events, month])
  // From an empty month, the way to the next one that has something.
  const laterDay = useMemo(() => Array.from(byDay.keys()).sort().find((d) => monthOf(d) > month) ?? null, [byDay, month])

  const go = (m: string) => setShownMonth(m)
  const pick = (day: string) => { setPicked(day); setShownMonth(monthOf(day)) }
  const onThisMonth = month === monthOf(today)

  return (
    <section className="cal" aria-labelledby={`${uid}h`}>
      <div className="cal-head">
        <h2 id={`${uid}h`} className="cal-title">
          <span className="visually-hidden">{heading}: </span>
          <span aria-live="polite">{monthLabel(month)}</span>
        </h2>
        <div className="cal-nav">
          {!onThisMonth && (
            <button type="button" className="cal-btn cal-btn--text" onClick={() => { setPicked(null); setShownMonth(monthOf(firstAhead ?? today)) }}>
              {firstAhead && monthOf(firstAhead) !== monthOf(today) ? 'Next trip' : 'This month'}
            </button>
          )}
          <button type="button" className="cal-btn" aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`} onClick={() => go(shiftMonth(month, -1))}>
            <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />
          </button>
          <button type="button" className="cal-btn" aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`} onClick={() => go(shiftMonth(month, 1))}>
            <ChevronRight size={20} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      <div className="cal-body">
      <div className="cal-month">
      <table className="cal-grid">
        <caption className="visually-hidden">{monthLabel(month)}: {inMonthCount ? `${inMonthCount} trip${inMonthCount === 1 ? '' : 's'}` : 'no trips'}. Days with trips are buttons.</caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([full, short], i) => (
              <th key={i} scope="col" abbr={full} className="cal-wd"><span aria-hidden="true">{short}</span><span className="visually-hidden">{full}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].day}>
              {week.map(({ day, inMonth }) => {
                const list = byDay.get(day) ?? []
                const rides = list.filter((e) => e.kind !== 'tour').length
                const tours = list.length - rides
                const num = Number(day.slice(8))
                const cls = ['cal-day', inMonth ? '' : 'is-out', day === today ? 'is-today' : '', day === selected ? 'is-on' : '', day < today ? 'is-past' : ''].filter(Boolean).join(' ')
                const marks = (
                  <span className="cal-marks" aria-hidden="true">
                    {list.length > 3
                      ? <span className="cal-count">{list.length}</span>
                      : <>{Array.from({ length: rides }, (_, i) => <span key={`r${i}`} className="cal-dot" />)}{Array.from({ length: tours }, (_, i) => <span key={`t${i}`} className="cal-ring" />)}</>}
                  </span>
                )
                return (
                  <td key={day} className="cal-cell">
                    {list.length > 0 ? (
                      <button
                        type="button" className={cls} aria-pressed={day === selected}
                        aria-label={`${longDay(day, thisYear)}${day === today ? ', today' : ''}: ${daySummary(list)}`}
                        onClick={() => pick(day)}
                      >
                        <span className="cal-num">{num}</span>{marks}
                      </button>
                    ) : (
                      <span className={cls}>
                        <span className="cal-num">{num}</span>
                        {day === today ? <span className="visually-hidden">, today, no trips</span> : null}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="cal-legend" aria-hidden="true">
        <span className="cal-dot" /> Ride <span className="cal-ring cal-legend-gap" /> Tour <span className="cal-legend-today" /> Today
      </p>

      {inMonthCount === 0 && (
        <p className="cal-note">
          No trips in {monthLabel(month)}.{' '}
          {laterDay ? <button type="button" className="cal-link" onClick={() => pick(laterDay)}>Next one: {shortDay(laterDay, thisYear)}</button> : null}
        </p>
      )}
      </div>

      <div className="cal-day-list">
        <h3 className="cal-day-title" aria-live="polite">
          {dayWord(selected, today) === shortDay(selected, thisYear) ? shortDay(selected, thisYear) : `${dayWord(selected, today)}, ${shortDay(selected, thisYear)}`}
          <span className="cal-day-count"> · {daySummary(dayList)}</span>
        </h3>
        {dayList.length === 0 ? (
          <p key={selected} className="cal-note">Nothing booked for this day.</p>
        ) : (
          <ul key={selected} className="cal-events">
            {dayList.map((e) => {
              const body = (
                <>
                  <span className="cal-ev-time">
                    {e.kind === 'tour' ? (e.pickupTime ? clockFromHHMM(e.pickupTime) : 'Tour') : clock(e.at)}
                  </span>
                  <span className="cal-ev-main">
                    <span className="cal-ev-who">
                      <span className={e.kind === 'tour' ? 'cal-ring' : 'cal-dot'} aria-hidden="true" />
                      {e.kind === 'arrival' ? 'Lands' : e.kind === 'departure' ? 'Hotel pickup' : 'Tour'} · {e.guest}
                    </span>
                    <span className="cal-ev-what"><What e={e} /></span>
                    <span className="cal-ev-meta">
                      {[e.party, e.flight ? `flight ${e.flight}` : null, e.ref].filter(Boolean).map((part, i) => (
                        <span key={i}>{i > 0 ? ' · ' : ''}<span className="cal-nowrap">{part}</span></span>
                      ))}
                    </span>
                  </span>
                  {onOpen ? <ChevronRight className="cal-ev-go" size={18} strokeWidth={2.25} aria-hidden /> : null}
                </>
              )
              return (
                <li key={e.key}>
                  {onOpen
                    ? <button type="button" className="cal-ev" onClick={() => onOpen(e)}><span className="visually-hidden">{openWord}: </span>{body}</button>
                    : <div className="cal-ev">{body}</div>}
                </li>
              )
            })}
          </ul>
        )}
        <p className="cal-foot">Times are Jamaica time.</p>
      </div>
      </div>
    </section>
  )
}
