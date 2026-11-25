import { render } from '@react-email/render'
import { sendEmail, opsBcc } from '@/lib/email/send'
import DriverUpdate from '@/emails/DriverUpdate'
import { DRIVER_COLS, VALID_EMAIL, bookingDriverColumns, bookingHasDriver, type Driver } from '@/lib/drivers'
import { buildDriverUpdate, buildProblem, guestSendProblem, sentDriverKey, sentKey, toldBefore, type Leg, type UpdateAbout } from '@/lib/driver-update'
import type { Bk } from '@/lib/dispatch'
import { sendToParty } from '@/lib/travel-party-server'
import { bookerName, driverUpdateForParty } from '@/lib/travel-party'

/**
 * Preview, test and send the driver-update email (lib/driver-update.ts says
 * what it says). Used only by the admin route /api/admin/driver-update,
 * which checks the admins allowlist first.
 *
 *   preview  the email as the guest would get it now, rendered; writes nothing
 *   test     that same email to one address of the operator's choosing, with
 *            "[Test]" before the subject; writes nothing, copies nobody
 *   send     saves the driver on the booking (the booking's own driver_*
 *            columns, only while it is a paid transfer), then emails the
 *            guest with operations and the driver on BCC, as the day-of
 *            email does, and records the send in `dispatch`
 *
 * SAFETY: never touches money, status or Stripe columns. A repeated send of
 * the same email (a double tap, a retry after an unclear failure) is
 * delivered once: the Resend key is this booking, ride and driver plus a
 * fingerprint of the message.
 */

/** Long enough for Resend, short enough to answer inside Netlify's limit. */
export const SEND_TIMEOUT_MS = 6000

export type Outcome =
  | { ok: true; subject: string; html: string; told: boolean; guestProblem: string | null }
  | { ok: true; sentTo: string; sentAt?: string; driverColumns?: ReturnType<typeof bookingDriverColumns>; warning?: string }
  | { ok: false; status: number; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

async function load(svc: Svc, bookingId: string, driverId: string): Promise<{ b: Bk; d: Driver } | { ok: false; status: number; error: string }> {
  const { data: b, error: bErr } = await svc.from('bookings').select('*, booking_items(*)').eq('id', bookingId).maybeSingle()
  if (bErr) return { ok: false, status: 500, error: `Could not read the booking: ${bErr.message}` }
  if (!b) return { ok: false, status: 404, error: 'Booking not found.' }
  const { data: d, error: dErr } = await svc.from('drivers').select(DRIVER_COLS).eq('id', driverId).maybeSingle()
  if (dErr) return { ok: false, status: 500, error: `Could not read the saved drivers: ${dErr.message}` }
  if (!d) return { ok: false, status: 404, error: 'That driver is not on the Drivers page.' }
  return { b, d }
}

export async function previewDriverUpdate(svc: Svc, bookingId: string, leg: Leg, driverId: string, nowMs: number): Promise<Outcome> {
  const got = await load(svc, bookingId, driverId)
  if ('ok' in got) return got
  const problem = buildProblem(got.b, leg, got.d)
  if (problem) return { ok: false, status: 409, error: problem }
  const told = toldBefore(got.b, leg)
  const { subject, props } = buildDriverUpdate(got.b, leg, got.d, nowMs, told)
  const html = await render(DriverUpdate(props))
  return { ok: true, subject, html, told, guestProblem: guestSendProblem(got.b, leg, got.d, nowMs) }
}

export async function testDriverUpdate(svc: Svc, bookingId: string, leg: Leg, driverId: string, to: string, nowMs: number): Promise<Outcome> {
  const address = (to ?? '').trim().toLowerCase()
  if (!VALID_EMAIL.test(address)) return { ok: false, status: 400, error: 'Type the email address the test should go to.' }
  const got = await load(svc, bookingId, driverId)
  if ('ok' in got) return got
  const problem = buildProblem(got.b, leg, got.d)
  if (problem) return { ok: false, status: 409, error: problem }
  const { subject, props } = buildDriverUpdate(got.b, leg, got.d, nowMs)
  const res = await sendEmail({
    to: address,
    subject: `[Test] ${subject}`,
    react: DriverUpdate(props),
    tags: [{ name: 'type', value: 'driver_update_test' }],
    timeoutMs: SEND_TIMEOUT_MS,
  })
  if (!res.ok) return { ok: false, status: 502, error: `The test did not send (${res.error ?? 'no answer'}). Try again.` }
  return { ok: true, sentTo: address }
}

/**
 * `opts` (Nov 24 2026, the driver portal, lib/dispatch-change-server):
 *   about  what the email is about: a new driver (the default), a new time
 *          for the driver already on the booking, or that driver's new details
 *          (Nov 25 2026); a new-time or new-details email is refused unless
 *          the booking carries exactly this saved driver, so the driver
 *          columns written in step 1 never change anything.
 *   key    the Resend key's name (the message fingerprint is still added), so
 *          one saved change is emailed once however often it is retried.
 *   timeoutMs  a shorter wait for the guest's email, where the caller has
 *          more to do inside the function's time.
 */
export async function sendDriverUpdate(
  svc: Svc,
  bookingId: string,
  leg: Leg,
  driverId: string,
  nowMs: number,
  opts: { about?: UpdateAbout; key?: string; timeoutMs?: number } = {},
): Promise<Outcome> {
  const got = await load(svc, bookingId, driverId)
  if ('ok' in got) return got
  const { b, d } = got
  const problem = guestSendProblem(b, leg, d, nowMs)
  if (problem) return { ok: false, status: 409, error: problem }
  // A new time, or the same driver's new details (a saved driver's edit,
  // lib/driver-edit-server): the booking must already carry exactly this saved
  // driver, so step 1 below never changes who drives.
  if ((opts.about?.kind === 'time' || opts.about?.kind === 'details') && !bookingHasDriver(b, d)) {
    return { ok: false, status: 409, error: 'The driver on this ride is not the saved driver, so the email cannot be written. Choose the driver again first.' }
  }
  // Read before this send stamps anything.
  const told = toldBefore(b, leg)

  // 1) The booking carries the driver first: it is the record the driver
  //    portal, the guest's account page, the next day-of email and the
  //    payouts read. Only while it is still a paid transfer.
  const cols = bookingDriverColumns(d)
  const { data: rows, error: wErr } = await svc
    .from('bookings')
    .update(cols)
    .eq('id', b.id)
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .select('id')
  if (wErr) return { ok: false, status: 500, error: `The driver was not saved on the booking (${wErr.message}). Nothing was sent.` }
  if (!rows || rows.length !== 1) return { ok: false, status: 409, error: 'This booking is no longer paid. Nothing was saved or sent.' }

  // 2) The email, from the booking as it now stands.
  const { subject, props } = buildDriverUpdate({ ...b, ...cols }, leg, d, nowMs, told, opts.about)
  const res = await sendEmail({
    to: b.email,
    // Operations, the driver inbox (DRIVER_NOTIFY_EMAIL) and this driver hold what the guest holds.
    bcc: opsBcc(b.email, [d.email]),
    subject,
    react: DriverUpdate(props),
    tags: [{ name: 'type', value: 'driver_update' }],
    dedupe: opts.key ?? `driver-update/${b.id}/${leg}/${d.id}`,
    timeoutMs: opts.timeoutMs ?? SEND_TIMEOUT_MS,
  })
  if (!res.ok) {
    return { ok: false, status: 502, error: `${d.name} is saved on the booking, but the email did not send (${res.error ?? 'no answer'}). Send again: the guest gets it once.` }
  }

  // The travel party (lib/travel-party-server): each person their own copy,
  // after the guest's went, the sign at arrivals naming the booker. Keyed like
  // the guest's, so a double tap sends once. Best effort: never changes this.
  await sendToParty(svc, b.id, 'driver_update', (m) => ({
    subject,
    react: DriverUpdate(driverUpdateForParty(props, bookerName(b.first_name), m.stopUrl)),
    key: opts.key ? `travel-party/${opts.key}/${m.id}` : `travel-party/driver-update/${b.id}/${leg}/${d.id}/${m.id}`,
  }))

  // 3) The record of it, merged atomically beside the other dispatch keys.
  const sentAt = new Date(nowMs).toISOString()
  const { error: mErr } = await svc.rpc('merge_dispatch', {
    p_booking_id: b.id,
    p_patch: { [sentKey(leg)]: sentAt, [sentDriverKey(leg)]: d.name },
  })
  if (mErr) {
    console.error('[driver-update] sent, but the dispatch stamp did not save', { bookingId: b.id, leg, error: mErr.message })
    return { ok: true, sentTo: b.email, sentAt, driverColumns: cols, warning: 'The email went, but the console could not record it. It may not show as sent after a reload.' }
  }
  return { ok: true, sentTo: b.email, sentAt, driverColumns: cols }
}
