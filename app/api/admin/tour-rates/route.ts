import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { experiences, defaultRateCard } from '@/lib/experiences'
import { parseRateCard, sameCard } from '@/lib/tour-rates'
import { publishRates, readRateChanges, readSavedRates } from '@/lib/tour-rates-server'

/**
 * Tour rate desk (/admin/tour-rates).
 *
 * Admin-gated like the coupon desk: session -> user -> admins allowlist,
 * checked BEFORE anything else touches the database.
 *
 *   GET                                saved cards and the change log
 *   POST   { experienceId, card }      save a tour's card and publish it
 *   DELETE { experienceId }            put a tour back on the catalog's card
 *
 * A card is validated here with the same parseRateCard every deploy applies,
 * written with its change-log row in one transaction (migration 037), then a
 * deploy is started that publishes it to the site. Prices on the site change
 * when that deploy goes live, all at once, for the page and the checkout alike.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = createServerSupabase()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { svc, user }
}

/** The tour a request names, or null. Only tours in the catalog have cards. */
function tourOf(v: unknown) {
  const id = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(id) ? experiences.find((e) => e.id === id) ?? null : null
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const [saved, changes] = await Promise.all([readSavedRates(gate.svc!), readRateChanges(gate.svc!)])
    return NextResponse.json({ saved, changes })
  } catch (e) {
    console.error('[admin/tour-rates] read failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not read the saved rates. Try again in a moment.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!
  const user = gate.user!

  const body = await readBody(req)
  const tour = tourOf(body?.experienceId)
  if (!tour) return NextResponse.json({ error: 'That tour is not in the catalog.' }, { status: 400 })
  const parsed = parseRateCard(body?.card)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const fallback = defaultRateCard(tour.id)!

  let saved
  try {
    saved = (await readSavedRates(svc)).find((r) => r.experienceId === tour.id) ?? null
  } catch (e) {
    console.error('[admin/tour-rates] read failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not read the saved rates. Nothing was changed.' }, { status: 500 })
  }
  // Saving what is already in force changes nothing and starts no deploy.
  if (sameCard(saved ? saved.card : fallback, parsed.card)) return NextResponse.json({ ok: true, unchanged: true, card: parsed.card })

  const { error } = await svc.rpc('save_tour_rate_card', {
    p_experience_id: tour.id,
    p_pricing: parsed.card.pricing,
    p_min_guests: parsed.card.minGuests,
    p_default: fallback,
    p_by: user.id,
    p_by_email: user.email ?? null,
  })
  if (error) {
    console.error('[admin/tour-rates] save failed', tour.id, error.message)
    return NextResponse.json({ error: 'The rate could not be saved. Nothing was changed.' }, { status: 500 })
  }
  console.log('[admin/tour-rates] saved', JSON.stringify({ tour: tour.id, by: user.id }))
  const publish = await publishRates(`Tour rates: ${tour.title}`)
  return NextResponse.json({ ok: true, card: parsed.card, ...publish })
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!
  const user = gate.user!

  const body = await readBody(req)
  const tour = tourOf(body?.experienceId)
  if (!tour) return NextResponse.json({ error: 'That tour is not in the catalog.' }, { status: 400 })

  const { data, error } = await svc.rpc('reset_tour_rate_card', {
    p_experience_id: tour.id,
    p_default: defaultRateCard(tour.id),
    p_by: user.id,
    p_by_email: user.email ?? null,
  })
  if (error) {
    console.error('[admin/tour-rates] reset failed', tour.id, error.message)
    return NextResponse.json({ error: 'The rate could not be reset. Nothing was changed.' }, { status: 500 })
  }
  const changed = !!(data as { changed?: boolean } | null)?.changed
  if (!changed) return NextResponse.json({ ok: true, unchanged: true })
  console.log('[admin/tour-rates] reset', JSON.stringify({ tour: tour.id, by: user.id }))
  const publish = await publishRates(`Tour rates: ${tour.title} back to default`)
  return NextResponse.json({ ok: true, ...publish })
}
