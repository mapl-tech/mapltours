import { createHmac, timingSafeEqual } from 'node:crypto'
import { maskEmail, normalizeEmail } from '@/lib/booking-sync'
import { TRIP_TIPS_POSTAL_ADDRESS } from './postal'

/**
 * Trip tips unsubscribe: the signed link in every tip, the page behind it, and
 * what a stop records.
 *
 *   https://mapltours.com/api/trip-tips/unsubscribe?e=<base64url(email)>&t=<token>
 *   token = base64url(HMAC-SHA256(TRIP_TIPS_SECRET, "trip-tips:v1:stop:" + lower-cased email))
 *
 * The same URL is the https half of the List-Unsubscribe header, so it answers
 * three ways (app/api/trip-tips/unsubscribe/route.ts):
 *   GET / HEAD   a small page with one button. Inert: mail scanners open every
 *                link in a message before the person does, so a GET that
 *                unsubscribed would act for them.
 *   POST form    the page's button: records the stop and says so.
 *   POST one-click   a mail client's RFC 8058 unsubscribe (body
 *                "List-Unsubscribe=One-Click"): records the stop directly and
 *                answers 200 with no redirect.
 *
 * A stop is Resend's global `unsubscribed` flag on the contact. The daily job
 * reads that flag before every send, and the bio's Resend webhook copies it to
 * HubSpot (mapl_tips "no", source "unsubscribe link"). Nothing here ever sets
 * the flag back to false: a stop is never lifted from this side.
 */

export const TOKEN_PREFIX = 'trip-tips:v1:stop:'
export const UNSUBSCRIBE_PATH = '/api/trip-tips/unsubscribe'
export const SITE = 'https://mapltours.com'
export const MAILTO_UNSUBSCRIBE = 'mailto:contact@mapltours.com?subject=stop'

/**
 * The address a link may carry: exactly the shape the job mails (lower case,
 * trimmed, normalizeEmail's rule, so "jane~trips@", "o&m@" or a non-ASCII
 * address verifies too) and no control characters. The HMAC is the real
 * guard; this only refuses what the job would never have signed.
 */
const signable = (email: string) => email.length <= 320 && !/[\u0000-\u001f\u007f]/.test(email) && normalizeEmail(email) === email

export function signStop(email: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_PREFIX}${email.trim().toLowerCase()}`).digest('base64url')
}

export function unsubscribeUrl(email: string, secret: string, site: string = SITE): string {
  const addr = email.trim().toLowerCase()
  const e = Buffer.from(addr, 'utf8').toString('base64url')
  return `${site.replace(/\/$/, '')}${UNSUBSCRIBE_PATH}?e=${e}&t=${signStop(addr, secret)}`
}

/** Both unsubscribe routes a mail client can take, https first (the one-click one). */
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>, <${MAILTO_UNSUBSCRIBE}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/**
 * The address a link carries, or null for anything that is not exactly a link
 * we signed: non-canonical base64 (Node's decoder skips junk, so the round trip
 * is checked), an address that is not lower case or not an address, or a token
 * that does not match. The compare is constant time.
 */
export function verifyStop(e: unknown, t: unknown, secret: string): string | null {
  if (!secret) return null
  if (typeof e !== 'string' || !/^[A-Za-z0-9_-]{4,440}$/.test(e)) return null
  if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(t)) return null
  const raw = Buffer.from(e, 'base64url')
  if (raw.toString('base64url') !== e) return null
  const email = raw.toString('utf8')
  if (!signable(email)) return null
  const want = Buffer.from(signStop(email, secret))
  const got = Buffer.from(t)
  return want.length === got.length && timingSafeEqual(want, got) ? email : null
}

/* ── Recording a stop ───────────────────────────────────────────────────── */

const RESEND_API = 'https://api.resend.com'

/** Resend's contact path takes the address itself; keep the @ readable, encode the rest. */
export const contactPath = (email: string) => `/contacts/${encodeURIComponent(email).replace(/%40/g, '@')}`

export type StopResult = { ok: boolean; status: number }

/**
 * Tips off for this address: PATCH the Resend contact to unsubscribed. A 404
 * means Resend has no contact for the address, so nothing is being sent to it
 * and there is nothing to stop: that is a success. Never throws.
 */
export async function recordStop(email: string, resendKey: string, f: typeof fetch = fetch, timeoutMs = 5_000): Promise<StopResult> {
  let status = 0
  try {
    const r = await f(`${RESEND_API}${contactPath(email)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribed: true }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    status = r.status
    await r.text().catch(() => '')
  } catch {
    status = 0
  }
  const ok = (status >= 200 && status < 300) || status === 404
  return { ok, status }
}

/** The one line a stop leaves in the logs. Masked: never the address. */
export function stopLogLine(email: string, via: 'one_click' | 'page', result: StopResult): string {
  return JSON.stringify({ event: 'stopped', email: maskEmail(email), via, ok: result.ok, status: result.status })
}

/* ── The page ───────────────────────────────────────────────────────────── */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The page's footer line: the mailing address when TRIP_TIPS_POSTAL_ADDRESS
 * is set (lib/trip-tips/postal.ts, the same constant the tips print), the
 * brand alone while it is null (owner, Sept 27 2026: no address).
 */
export const footerLine = (address: string | null = TRIP_TIPS_POSTAL_ADDRESS): string => address?.trim() || 'MAPL Tours Jamaica'
const TITLE = 'Trip tips from MAPL Tours Jamaica'
const PRIVACY = `${SITE}/privacy`
const HOME = `${SITE}/?utm_source=email&utm_medium=email&utm_campaign=trip_tips&utm_content=unsubscribe`

export const COPY = {
  heading: 'One tap to stop trip tips',
  ask: 'Tap the button to stop trip tips to this address:',
  button: 'Stop trip tips',
  doneHeading: 'Trip tips are off',
  done: 'Done. No more trip tips to this address.',
  broken: 'That link did not work. To stop trip tips, email contact@mapltours.com with the word stop and we will take you off the list.',
  sorry: 'Sorry, trip tips cannot be changed from this page right now. Please try again later, or email contact@mapltours.com with the word stop.',
  retry: 'That did not go through. Please tap the button again in a moment.',
  home: 'Go to mapltours.com',
} as const

// The bio's /tips page system (bio netlify/lib/tips-page.mts), so the page a
// tip leads to looks like the tip: #FAF9F7 page, DM Sans stack, 26px heading,
// 17px body. The gold pill now carries dark ink: #1A1508 on #A58326 is
// 5.09:1, AA at any size (white on it was 3.57:1). Hover lightens the gold
// and the ink gains contrast on it (#1A1508 on #B8942F is 6.34:1). Measured:
// green on the page 8.25:1, muted 7.76:1, body on either panel 13:1.
const CSS = `:root{--page:#FAF9F7;--ink:#171614;--body:#2B2926;--muted:#524F49;--green:#12563A;--line:rgba(23,22,20,.12);--ok:#EEF4EE;--ok-line:rgba(18,86,58,.24);--warn:#FCF1EC;--clay:#A33A20}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font-family:'DM Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
main,footer{max-width:480px;margin:0 auto;padding:40px 20px 32px}
h1{margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}
p{margin:0 0 24px;font-size:17px;line-height:1.6;color:var(--body);overflow-wrap:anywhere}
p a{display:inline-block;padding:12px 0;margin:-12px 0;color:var(--green);font-weight:700;text-underline-offset:3px}
form{margin:0}
button{display:block;width:100%;min-height:56px;padding:16px 24px;border:0;border-radius:999px;background:#A58326;color:#1A1508;font-family:inherit;font-size:19px;font-weight:700;line-height:1.2;cursor:pointer;transition:background-color .15s ease,transform .1s ease}
button:hover{background:#B8942F}
.pill{display:flex;align-items:center;justify-content:center;min-height:52px;padding:12px 24px;border:2px solid var(--green);border-radius:999px;color:var(--green);font-size:17px;font-weight:700;line-height:1.2;text-decoration:none;transition:background-color .15s ease,transform .1s ease}
.pill:hover{background:#E6EFE9}
button:active,.pill:active{transform:scale(.98)}
.note{margin:0 0 24px;padding:16px;border:1px solid var(--ok-line);border-radius:16px;background:var(--ok)}
.note p{margin:0}
.warn{border-color:rgba(163,58,32,.32);background:var(--warn)}
footer{padding-top:0;padding-bottom:40px}
footer p{margin:0;padding-top:16px;border-top:1px solid var(--line);font-size:14px;line-height:1.6;color:var(--muted)}
:focus-visible{outline:3px solid #171614;outline-offset:3px}
p a:focus-visible{outline-offset:0;border-radius:4px}
@media (min-width:600px){main{margin-top:64px;margin-bottom:24px;padding:40px;background:#FFFFFF;border:1px solid var(--line);border-radius:20px}footer{padding:0 40px 48px}footer p{border-top:0}}
@media (prefers-reduced-motion:reduce){button,.pill{transition:none}button:active,.pill:active{transform:none}}`

function doc(heading: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light only"><title>${esc(TITLE)}</title><style>${CSS}</style></head><body><main><h1>${esc(heading)}</h1>${body}</main><footer><p>${esc(footerLine())}. <a href="${esc(PRIVACY)}">Privacy</a></p></footer></body></html>`
}

const note = (kind: 'ok' | 'warn', text: string) =>
  `<div class="note ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}"><p>${esc(text)}</p></div>`

/** The confirm form posts the same e and t back, escaped although they were checked. */
function form(e: string, t: string): string {
  return `<form method="post" action="${UNSUBSCRIBE_PATH}"><input type="hidden" name="e" value="${esc(e)}"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">${esc(COPY.button)}</button></form>`
}

export const pages = {
  confirm: (email: string, e: string, t: string) =>
    doc(COPY.heading, `<p>${esc(COPY.ask)}</p><p><strong>${esc(email)}</strong></p>${form(e, t)}`),
  done: () => doc(COPY.doneHeading, `${note('ok', COPY.done)}<a class="pill" href="${esc(HOME)}">${esc(COPY.home)}</a>`),
  broken: () => doc(COPY.heading, note('warn', COPY.broken)),
  sorry: () => doc(COPY.heading, note('warn', COPY.sorry)),
  retry: (e: string, t: string) => doc(COPY.heading, `${note('warn', COPY.retry)}${form(e, t)}`),
}

/**
 * Headers for every answer: never cached, never framed, never indexed, and
 * the link's own URL (it carries the token and the address) never sent on as
 * a referrer.
 */
export const PAGE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

export interface UnsubscribeEnv {
  TRIP_TIPS_SECRET?: string
  RESEND_API_KEY?: string
}

const answer = (status: number, body: string | null, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...PAGE_HEADERS, ...extra } })

/** Reads e and t from the query string first (the one-click URL), then the form body. */
async function readPost(req: Request): Promise<{ e: string | null; t: string | null; oneClick: boolean }> {
  const q = new URL(req.url).searchParams
  let body = new URLSearchParams()
  const type = (req.headers.get('content-type') ?? '').toLowerCase()
  try {
    if (type.includes('multipart/form-data')) {
      const fd = await req.formData()
      fd.forEach((v, k) => { if (typeof v === 'string') body.append(k, v) })
    } else {
      body = new URLSearchParams((await req.text()).slice(0, 4096))
    }
  } catch {
    body = new URLSearchParams()
  }
  return {
    e: q.get('e') ?? body.get('e'),
    t: q.get('t') ?? body.get('t'),
    oneClick: body.get('List-Unsubscribe') === 'One-Click',
  }
}

/**
 * The whole unsubscribe endpoint, framework-free so it is tested directly.
 * `log` receives the one masked line a stop leaves.
 */
export async function handleUnsubscribe(
  req: Request,
  env: UnsubscribeEnv,
  f: typeof fetch = fetch,
  log: (line: string) => void = (l) => console.log('[trip-tips]', l),
): Promise<Response> {
  const method = req.method.toUpperCase()
  const head = method === 'HEAD'
  if (method !== 'GET' && !head && method !== 'POST') return answer(405, pages.broken(), { Allow: 'GET, HEAD, POST' })
  const secret = env.TRIP_TIPS_SECRET
  if (!secret) return answer(503, head ? null : pages.sorry())

  if (method !== 'POST') {
    const q = new URL(req.url).searchParams
    const e = q.get('e'), t = q.get('t')
    const email = verifyStop(e, t, secret)
    if (!email || !e || !t) return answer(400, head ? null : pages.broken())
    return answer(200, head ? null : pages.confirm(email, e, t))
  }

  const { e, t, oneClick } = await readPost(req)
  const email = verifyStop(e, t, secret)
  if (!email || !e || !t) {
    return oneClick
      ? new Response('That link did not work.', { status: 400, headers: { ...PAGE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
      : answer(400, pages.broken())
  }
  const key = env.RESEND_API_KEY
  if (!key) {
    return oneClick
      ? new Response('Unavailable. Please try again later.', { status: 503, headers: { ...PAGE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
      : answer(503, pages.sorry())
  }

  const result = await recordStop(email, key, f)
  log(stopLogLine(email, oneClick ? 'one_click' : 'page', result))
  if (oneClick) {
    return new Response(result.ok ? 'Unsubscribed from trip tips.' : 'Not recorded. Please try again.', {
      status: result.ok ? 200 : 502,
      headers: { ...PAGE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  return result.ok ? answer(200, pages.done()) : answer(502, pages.retry(e, t))
}
