import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mailboxKey } from '@/lib/contact-spam'
import { CART_STOP_PATH, cartReminderSecret, verifyCartStop } from '@/lib/cart-reminders'

/**
 * The stop link in both cart reminders, and their List-Unsubscribe target.
 *
 *   GET   a page with one button. Inert, because mail scanners open every
 *         link before the person does; a GET that stopped reminders would act
 *         for them.
 *   POST  the button, or a mail app's one-click (RFC 8058): the cart's inbox
 *         goes into cart_reminder_stops (migration 040), and the sweep sends
 *         it no reminder of either kind again.
 *
 * The link is ?b=<booking id>&t=HMAC(secret, "cart-reminders:v1:stop:" + id).
 * It names the cart, never the address; the address is read from the booking.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE = 'https://mapltours.com'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(kind: 'confirm' | 'done' | 'invalid', action?: string): string {
  const body =
    kind === 'confirm'
      ? `<h1>Stop reminders about saved trips?</h1>
         <p>We will not email you again about a trip you started and did not finish. Bookings you make still get their confirmation and trip details.</p>
         <form method="post" action="${esc(action ?? CART_STOP_PATH)}"><button type="submit">Stop these reminders</button></form>
         <p class="small"><a href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
      : kind === 'done'
        ? `<h1>Done. No more reminders.</h1>
           <p>Bookings you make still get their confirmation and trip details. If you change your mind, write to contact@mapltours.com.</p>
           <p><a class="btn" href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
        : `<h1>This link has expired or is not complete.</h1>
           <p>Write to contact@mapltours.com and we will stop the reminders for you.</p>
           <p><a class="btn" href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Trip reminders | MAPL Tours Jamaica</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F4F1EB; color: #1A1714; font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 520px; margin: 0 auto; padding: 48px 20px; }
  .card { background: #fff; border: 1px solid #E7E1D6; border-radius: 16px; padding: 28px 24px; border-top: 3px solid #B7873A; }
  .brand { margin: 0 0 18px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 13px; color: #7A5A08; }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 12px; }
  p { margin: 0 0 16px; color: #3D3A35; }
  button, .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 9999px; border: 0; background: #1A1714; color: #fff; font-weight: 600; font-size: 16px; line-height: 1; font-family: inherit; text-decoration: none; cursor: pointer; }
  button:focus-visible, a:focus-visible { outline: 3px solid #7A5A08; outline-offset: 3px; }
  .small { font-size: 14px; margin-top: 18px; }
  .small a { color: #1A1714; }
</style></head>
<body><main><div class="card"><p class="brand">MAPL Tours Jamaica</p>${body}</div></main></body></html>`
}

const html = (body: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })

function linkFrom(req: NextRequest) {
  return { b: req.nextUrl.searchParams.get('b'), t: req.nextUrl.searchParams.get('t') }
}

export async function GET(req: NextRequest) {
  const secret = cartReminderSecret()
  const { b, t } = linkFrom(req)
  if (!secret || !verifyCartStop(b, t, secret)) return html(page('invalid'), 400)
  return html(page('confirm', `${CART_STOP_PATH}?b=${encodeURIComponent(b)}&t=${encodeURIComponent(t!)}`))
}

export async function POST(req: NextRequest) {
  const secret = cartReminderSecret()
  const { b, t } = linkFrom(req)
  const oneClick = (await req.text().catch(() => '')).includes('List-Unsubscribe=One-Click')
  const refuse = (status: number) =>
    oneClick ? NextResponse.json({ error: status === 400 ? 'invalid link' : 'try again' }, { status }) : html(page('invalid'), status)
  if (!secret || !verifyCartStop(b, t, secret)) return refuse(400)

  const svc = createServiceClient()
  const { data: booking, error: readErr } = await svc.from('bookings').select('id, email').eq('id', b.toLowerCase()).maybeSingle()
  if (readErr) {
    console.error('[cart-reminders/stop] booking read failed', readErr.message)
    return refuse(500)
  }
  const email = typeof booking?.email === 'string' ? booking.email.trim() : ''
  // A cart that is gone (purged) has nothing left to remind about.
  if (!email.includes('@')) return oneClick ? new NextResponse(null, { status: 200 }) : html(page('done'))
  const { error } = await svc
    .from('cart_reminder_stops')
    .upsert({ inbox: mailboxKey(email), booking_id: booking!.id }, { onConflict: 'inbox', ignoreDuplicates: true })
  if (error) {
    console.error('[cart-reminders/stop] stop not recorded', error.message)
    return refuse(500)
  }
  return oneClick ? new NextResponse(null, { status: 200 }) : html(page('done'))
}
