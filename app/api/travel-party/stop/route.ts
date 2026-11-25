import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PARTY_STOP_PATH, partySecret, stopPartyMember, verifyPartyStop } from '@/lib/travel-party-server'

/**
 * The stop link in every email a travel party member gets
 * (lib/travel-party-server), and its List-Unsubscribe target.
 *
 *   GET   a page with one button. Inert, because mail scanners open every
 *         link before the person does; a GET that stopped the emails would
 *         act for them.
 *   POST  the button, or a mail app's one-click (RFC 8058): the party row is
 *         marked stopped, nothing more goes to that address for this booking,
 *         and the booker cannot add it again.
 *
 * The link is ?p=<party row id>&t=HMAC(secret, "travel-party:v1:stop:" + id).
 * It names the row, never the address.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE = 'https://mapltours.com'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(kind: 'confirm' | 'done' | 'invalid', action?: string): string {
  const body =
    kind === 'confirm'
      ? `<h1>Stop emails about this trip?</h1>
         <p>Someone you are traveling with added your email to their MAPL Tours Jamaica booking, so we have been sending you its details. Stop, and we will not email you about this trip again.</p>
         <form method="post" action="${esc(action ?? PARTY_STOP_PATH)}"><button type="submit">Stop these emails</button></form>
         <p class="small"><a href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
      : kind === 'done'
        ? `<h1>Done. No more emails about this trip.</h1>
           <p>We have not kept your address for anything else. If you change your mind, ask the person who booked to forward their emails.</p>
           <p><a class="btn" href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
        : `<h1>This link has expired or is not complete.</h1>
           <p>Write to contact@mapltours.com and we will stop the emails for you.</p>
           <p><a class="btn" href="${SITE}">Back to MAPL Tours Jamaica</a></p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Trip emails | MAPL Tours Jamaica</title>
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
  return { p: req.nextUrl.searchParams.get('p'), t: req.nextUrl.searchParams.get('t') }
}

export async function GET(req: NextRequest) {
  const secret = partySecret()
  const { p, t } = linkFrom(req)
  if (!secret || !verifyPartyStop(p, t, secret)) return html(page('invalid'), 400)
  return html(page('confirm', `${PARTY_STOP_PATH}?p=${encodeURIComponent(p)}&t=${encodeURIComponent(t!)}`))
}

export async function POST(req: NextRequest) {
  const secret = partySecret()
  const { p, t } = linkFrom(req)
  const oneClick = (await req.text().catch(() => '')).includes('List-Unsubscribe=One-Click')
  const refuse = (status: number) =>
    oneClick ? NextResponse.json({ error: status === 400 ? 'invalid link' : 'try again' }, { status }) : html(page('invalid'), status)
  if (!secret || !verifyPartyStop(p, t, secret)) return refuse(400)
  const stopped = await stopPartyMember(createServiceClient(), p.toLowerCase())
  if (!stopped) return refuse(500)
  return oneClick ? new NextResponse(null, { status: 200 }) : html(page('done'))
}
