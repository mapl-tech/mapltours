import { sendEmail, opsBcc } from '@/lib/email/send'
import { sendToParty } from '@/lib/travel-party-server'
import { bookerName } from '@/lib/travel-party'
import TransferDayOf from '@/emails/TransferDayOf'
import { firstLeg, bookingRef, jaDate, jaTime, legInstantMs, type Bk } from '@/lib/dispatch'
import { isDue, jaHour, jaDateKey, stampKey, withheldKey } from '@/lib/dayof-rules'
export { legInstantMs }

/**
 * Day-of-travel emails for transfers: when they are due, and sending one.
 *
 * Shared by the manual dispatch-console button and the hourly cron so both
 * paths send byte-identical mail and share one idempotency stamp. A guest can
 * therefore never get two copies, whichever path fires first.
 *
 * SAFETY: strictly additive. This reads bookings and writes only its own
 * `dispatch.dayof_*_sent` / `dispatch.dayof_*_withheld` bookkeeping keys,
 * always through merge_dispatch. It never touches money columns, booking
 * status, or the Stripe/webhook path.
 */

export const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay'
export const SUPPORT_EMAIL = 'contact@mapltours.com'

export type Leg = 'arrival' | 'departure'

// The timing rules are pure, in lib/dayof-rules, so the driver portal's change
// rules (lib/dispatch-change) read the same ones this job sends by.
export { isDue, jaHour, jaDateKey, stampKey, withheldKey }

/**
 * Pause before the one retry of a claim release. The re-read that fails in a
 * database blip is milliseconds before the release, so an immediate second
 * call usually fails in the same blip.
 */
export const RELEASE_RETRY_MS = 500

/*
 * withheldKey (lib/dayof-rules) is where a withheld send is recorded: a claim
 * that was won, then not sent because the booking had stopped being paid.
 * Deliberately NOT the sent key.
 * Everything that reports "sent" reads only `dayof_*_sent`: the dispatch
 * console's "✓ Day-of email sent" button and lib/dispatch autoStepDone's
 * driver_reconfirmed / departure_reminded ticks ("day-of email BCCed to the
 * driver"). Neither may claim a send that never happened. Informational only:
 * nothing gates on this key, since the status checks already block every
 * later send to a booking that is not paid.
 */

/**
 * Why this booking+leg cannot be mailed, or null if it can.
 *
 * The driver's name and number are required rather than optional: the whole
 * point of this email is telling a guest who is meeting them, and one that
 * says "being confirmed" in both fields is worse than none at all. The manual
 * console can still force a send once an operator has eyes on it.
 */
export function blockedReason(b: Bk, leg: Leg, opts: { ignoreStamp?: boolean } = {}): string | null {
  if (b.status !== 'paid') return 'booking is not paid'
  if (!b.email) return 'booking has no email'
  const l = firstLeg(b)
  if (!l) return 'booking has no transfer leg'
  const at = leg === 'arrival' ? l.arrivalAt : l.departureAt
  if (!at) return `no ${leg} time on this booking`
  // ignoreStamp: the re-check sendDayOf makes once it holds the claim (the
  // stamp it just wrote would otherwise answer 'already sent').
  if (!opts.ignoreStamp && (b.dispatch ?? {})[stampKey(leg)]) return 'already sent'
  if (!b.driver_name || !b.driver_phone) return 'driver not assigned yet'
  // Temporal gate, shared by the cron and the manual button. Without it an
  // operator on a booking weeks out could fire a day-of email that claims the
  // stamp, which would permanently suppress the correctly-timed automated
  // send. The label is also only 'Today' | 'Tomorrow', so a send outside that
  // window would put a false day in the subject line.
  const nowMs = Date.now()
  const atMs = legInstantMs(at)
  if (atMs <= nowMs) return 'pickup time has passed'
  const today = jaDateKey(nowMs)
  const legDay = jaDateKey(atMs)
  const tomorrow = jaDateKey(nowMs + 24 * 3_600_000)
  if (legDay !== today && legDay !== tomorrow) {
    return `not until ${legDay}; the hourly job sends it on the day`
  }
  return null
}

export interface DayOfResult {
  ok: boolean
  bookingId: string
  leg: Leg
  sentTo?: string
  skipped?: string
  error?: string
}

/**
 * Send one leg's day-of email, exactly once.
 *
 * The stamp is claimed BEFORE the send, conditional on it still being unset,
 * so two overlapping runs cannot both mail the guest: the loser's update
 * matches zero rows and it backs out. If the send then fails, the claim is
 * released so the next run can retry. Between winning the claim and sending,
 * the booking's status is re-read and the send goes ahead only on a fresh
 * 'paid'; see the comment at that check for what each other answer does.
 * No exit that did not send leaves this attempt's claim behind as "sent"
 * without saying so: a release that fails twice returns `error` (the cron's
 * failed list, a 502 from the console route) and logs CRITICAL.
 *
 * `force` bypasses ONLY the already-sent stamp, for the operator resending to
 * a guest who lost the mail. It never bypasses the driver-assigned guard: a
 * resend that still cannot name the driver is just as useless as the first.
 */
export async function sendDayOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  b: Bk,
  leg: Leg,
  opts: { force?: boolean } = {},
): Promise<DayOfResult> {
  const base = { bookingId: b.id as string, leg }
  const reason = blockedReason(b, leg)
  if (reason && !(opts.force && reason === 'already sent')) {
    return { ...base, ok: false, skipped: reason }
  }

  const l = firstLeg(b)
  if (!l) return { ...base, ok: false, skipped: 'booking has no transfer leg' }
  if (!b.email) return { ...base, ok: false, skipped: 'booking has no email' }
  const at = leg === 'arrival' ? l.arrivalAt : l.departureAt
  if (!at) return { ...base, ok: false, skipped: `no ${leg} time on this booking` }

  const isArrival = leg === 'arrival'
  const ref = bookingRef(b.id)
  const key = stampKey(leg)
  const claimedAt = new Date().toISOString()
  // Read before claiming: a forced claim overwrites it.
  const prior = (b.dispatch ?? {})[key]

  // Claim first, and only if nobody else holds it. merge_dispatch is an
  // atomic jsonb merge in one statement, so this can never erase keys a
  // concurrent writer (console step ticks, payment records) is setting.
  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: b.id,
    p_patch: { [key]: claimedAt },
    p_only_if_absent: opts.force ? null : key,
  })
  if (!opts.force && (!claimed || claimed.length === 0)) {
    return { ...base, ok: false, skipped: 'already sent' }
  }

  // Undo this attempt's claim on every exit that did not send, so the stamp
  // only ever records a real send. A forced resend overwrote the stamp of an
  // earlier REAL send; undoing it puts that stamp back rather than erasing
  // the record that the guest was mailed. Otherwise the key is removed, which
  // frees it for the next hourly run. `patch` lands in the same atomic
  // merge_dispatch statement (p_remove applies before p_patch).
  //
  // supabase-js RETURNS errors rather than throwing them, and the release
  // runs milliseconds after whatever just failed, so it is checked, retried
  // once after a pause, and a release that still fails is reported as an
  // error. A stamp left behind reads as "✓ Day-of email sent" on the
  // console and 'already sent' to every later run, so the one exit that
  // must never pass quietly is this one. Resolves true once released.
  const undoClaim = async (patch: Record<string, string>, ifStuck: string): Promise<boolean> => {
    const args = opts.force && typeof prior === 'string' && prior
      ? { p_booking_id: b.id, p_patch: { ...patch, [key]: prior } }
      : { p_booking_id: b.id, p_remove: [key], p_patch: patch }
    let last = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, RELEASE_RETRY_MS))
      try {
        const res = await svc.rpc('merge_dispatch', args)
        if (!res?.error) return true
        last = res.error.message ?? String(res.error)
      } catch (err) {
        last = err instanceof Error ? err.message : String(err)
      }
    }
    console.error(`[dayof] CRITICAL: day-of stamp NOT released for ${b.id}/${leg}. It reads as sent, but nothing was sent. ${ifStuck}`, {
      bookingId: b.id, leg, error: last,
    })
    return false
  }
  const RESEND = 'Resend from the dispatch console.'
  const NOT_RELEASED = 'claim NOT released, resend from the dispatch console'

  // The row in hand is the caller's opening snapshot, and the cron loop's
  // awaited sends leave it seconds-to-minutes stale, long enough for a
  // self-serve cancellation or an admin refund to commit AFTER blockedReason
  // approved it, which would put driver details in a refunded guest's inbox
  // minutes after ops was told to stand down. So re-read the status now that
  // the claim is won, and send only on a fresh 'paid'. This is the same
  // read-to-write race lib/email/claim.ts closes with requireStatus;
  // merge_dispatch itself has no status predicate. (Audit 2026-08-22.)
  //
  // The same read also brings the driver and the ride as they are NOW, and the
  // email is written from those (Nov 24 2026). A fleet manager can change who
  // drives or when from the driver portal (lib/dispatch-change); a change that
  // lands while this run is working through its list would otherwise reach the
  // guest as the details it replaced. Anything this read leaves out keeps the
  // snapshot's value.
  const { data: fresh, error: freshErr } = await svc
    .from('bookings')
    .select('status, email, first_name, driver_name, driver_phone, driver_vehicle, driver_plate, booking_items(*)')
    .eq('id', b.id)
    .maybeSingle()

  // Unreadable or missing: we cannot prove either way, so nobody sends now,
  // and the claim is RELEASED so the next hourly run tries again. Keeping it
  // turned one transient database error into a paid guest never getting
  // their driver's name and number, while the console showed "✓ Day-of
  // email sent" and auto-ticked the driver reminder. Releasing is safe for a
  // booking that has meanwhile stopped being paid: the cron only selects
  // paid rows, blockedReason refuses anything not paid, and the next attempt
  // re-reads the status here again before it sends.
  if (freshErr || !fresh) {
    const released = await undoClaim({}, RESEND)
    const why = freshErr ? `status re-check errored (${freshErr.message})` : 'booking is missing at send time'
    if (!released) return { ...base, ok: false, error: `${why}; ${NOT_RELEASED}` }
    const reason = freshErr ? `${why}; claim released, the next run retries` : `${why}; claim released`
    // The errored read is the loud one: mail a paid guest is owed is late.
    const log = freshErr ? console.error : console.warn
    log('[dayof] claim won but send withheld', { bookingId: b.id, leg, reason })
    return { ...base, ok: false, skipped: reason }
  }

  // Definitely not paid (refunded, canceled, failed): withhold, and record
  // that under its own key instead of leaving the claim looking like a send.
  // What stops a later run mailing this booking is its status, checked three
  // times over (the cron's paid-only query, blockedReason, this re-read), not
  // the stamp. So a booking that genuinely becomes paid again, such as a
  // failed payment later retried, still gets its email.
  if (fresh.status !== 'paid') {
    const reason = `booking is '${fresh.status}' at send time, not paid; email withheld`
    const released = await undoClaim({ [withheldKey(leg)]: claimedAt }, 'The booking is not paid, so do not resend.')
    if (!released) return { ...base, ok: false, error: `${reason}, but the claim was NOT released and reads as sent` }
    console.warn('[dayof] claim won but send withheld', { bookingId: b.id, leg, reason })
    return { ...base, ok: false, skipped: reason }
  }

  // The booking as it is now: the fresh read over the snapshot. Checked again
  // as the job would check it (the stamp aside: this attempt holds it), so a
  // ride moved to another day, or left with no driver, is released for the
  // run that should send it rather than mailed with the wrong words.
  const cur: Bk = { ...b }
  for (const [k, v] of Object.entries(fresh as Record<string, unknown>)) {
    if (v === undefined) continue
    if (k === 'booking_items' && !(Array.isArray(v) && v.length)) continue
    cur[k] = v
  }
  const nowBlocked = blockedReason(cur, leg, { ignoreStamp: true })
  if (nowBlocked) {
    const released = await undoClaim({}, RESEND)
    const reason = `${nowBlocked} (read again at send time)`
    if (!released) return { ...base, ok: false, error: `${reason}; ${NOT_RELEASED}` }
    console.warn('[dayof] claim won but the booking changed; released', { bookingId: b.id, leg, reason })
    return { ...base, ok: false, skipped: `${reason}; claim released` }
  }
  const cl = firstLeg(cur)!
  const cat = (isArrival ? cl.arrivalAt : cl.departureAt)!
  // A dawn pickup is mailed the evening before, so say which day it is rather
  // than asserting "today" and being wrong for exactly the guests who are up
  // earliest. Compared in Jamaica dates, the only calendar that matters here.
  const curDay: 'Today' | 'Tomorrow' =
    jaDateKey(legInstantMs(cat)) === jaDateKey(Date.now()) ? 'Today' : 'Tomorrow'

  const subject = isArrival
    ? `${curDay}: your MAPL Tours Jamaica driver at Montego Bay (${ref})`
    : `${curDay}: your ride to the airport (${ref})`
  const dayOfProps = {
    bookingRef: ref,
    firstName: cur.first_name,
    leg,
    whenLabel: `${jaDate(cat)}, ${jaTime(cat)}`,
    dayLabel: curDay,
    pickupLabel: isArrival ? AIRPORT : cl.hotel,
    dropoffLabel: isArrival ? cl.hotel : AIRPORT,
    flight: (isArrival ? cl.arrivalFlight : cl.departureFlight) ?? null,
    passengers: cl.passengers,
    driverName: cur.driver_name ?? null,
    driverPhone: cur.driver_phone ?? null,
    driverVehicle: cur.driver_vehicle ?? null,
    driverPlate: cur.driver_plate ?? null,
    supportEmail: SUPPORT_EMAIL,
  }
  const res = await sendEmail({
    to: cur.email,
    // Operations and the driver hold exactly what the guest holds.
    bcc: opsBcc(cur.email),
    subject,
    react: TransferDayOf(dayOfProps),
    tags: [{ name: 'type', value: 'transfer_dayof' }],
  })

  if (!res?.ok) {
    // Release the claim so the next run retries rather than silently
    // dropping. Only OUR key is touched, atomically.
    const sendError = res?.error ?? 'send failed'
    const released = await undoClaim({}, RESEND)
    return { ...base, ok: false, error: released ? sendError : `${sendError}; ${NOT_RELEASED}` }
  }

  // The travel party (lib/travel-party-server): each person their own copy,
  // only now that the guest's went, keyed to this claim so a resend sends
  // again and a retry does not. Best effort: never changes this result.
  await sendToParty(svc, b.id, 'dayof', (m) => ({
    subject,
    react: TransferDayOf({ ...dayOfProps, firstName: null, party: { addedBy: bookerName(cur.first_name), stopUrl: m.stopUrl } }),
    key: `travel-party/dayof/${b.id}/${leg}/${claimedAt}/${m.id}`,
  }))

  return { ...base, ok: true, sentTo: cur.email }
}
