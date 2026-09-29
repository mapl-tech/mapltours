import { handleUnsubscribe } from '@/lib/trip-tips/unsubscribe'

/**
 * The unsubscribe link in every trip tip, and the https half of its
 * List-Unsubscribe header (lib/trip-tips/unsubscribe.ts has the rules).
 *
 *   GET / HEAD  a confirm page with one button; records nothing (mail
 *               scanners open links before people do)
 *   POST        the button, or a mail client's one-click unsubscribe
 *               (RFC 8058): records the stop in Resend
 *
 * Never prerendered or cached: the answer depends on the signed link, and a
 * one-click POST must reach this handler every time.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const env = () => ({ TRIP_TIPS_SECRET: process.env.TRIP_TIPS_SECRET, RESEND_API_KEY: process.env.RESEND_API_KEY })

export async function GET(request: Request) {
  return handleUnsubscribe(request, env())
}

export async function HEAD(request: Request) {
  return handleUnsubscribe(request, env())
}

export async function POST(request: Request) {
  return handleUnsubscribe(request, env())
}
