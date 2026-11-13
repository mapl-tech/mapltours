import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseRateCard, type RateCard } from './tour-rates'

/**
 * The database half of /admin/tour-rates: the saved cards, the change log and
 * publishing. The rules a card must meet are in lib/tour-rates.ts; the table
 * and the two functions that write it are migration 037.
 */

export interface SavedRate {
  experienceId: number
  card: RateCard
  updatedAt: string
  updatedByEmail: string | null
}

export interface RateChange {
  id: number
  experienceId: number
  action: 'save' | 'reset'
  before: RateCard | null
  after: RateCard | null
  changedByEmail: string | null
  changedAt: string
}

/** A logged card back in canonical shape, or null when it is missing or does not read. */
function loggedCard(v: unknown): RateCard | null {
  const r = parseRateCard(v)
  return r.ok ? r.card : null
}

export async function readSavedRates(svc: SupabaseClient): Promise<SavedRate[]> {
  const { data, error } = await svc
    .from('tour_rate_cards')
    .select('experience_id, pricing, min_guests, updated_at, updated_by_email')
    .order('experience_id', { ascending: true })
  if (error) throw new Error(`tour_rate_cards: ${error.message}`)
  return (data ?? []).flatMap((r) => {
    const card = loggedCard({ pricing: r.pricing, minGuests: r.min_guests })
    return card ? [{ experienceId: r.experience_id as number, card, updatedAt: r.updated_at as string, updatedByEmail: (r.updated_by_email as string | null) ?? null }] : []
  })
}

export async function readRateChanges(svc: SupabaseClient, limit = 40): Promise<RateChange[]> {
  const { data, error } = await svc
    .from('tour_rate_changes')
    .select('id, experience_id, action, before, after, changed_by_email, changed_at')
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`tour_rate_changes: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as number,
    experienceId: r.experience_id as number,
    action: r.action as 'save' | 'reset',
    before: loggedCard(r.before),
    after: loggedCard(r.after),
    changedByEmail: (r.changed_by_email as string | null) ?? null,
    changedAt: r.changed_at as string,
  }))
}

/**
 * Start the deploy that publishes the saved cards (a Netlify build hook,
 * NETLIFY_RATES_BUILD_HOOK). The build snapshots every saved card, so one
 * deploy carries all saves made before it starts. Never throws: a save that
 * could not start a deploy says so, and the next deploy of any kind publishes
 * it anyway.
 */
export async function publishRates(title: string, f: typeof fetch = fetch): Promise<{ published: boolean; reason?: string }> {
  const hook = process.env.NETLIFY_RATES_BUILD_HOOK
  if (!hook) return { published: false, reason: 'no_build_hook' }
  try {
    const url = new URL(hook)
    url.searchParams.set('trigger_title', title.slice(0, 120))
    const res = await f(url.toString(), { method: 'POST', body: '{}', signal: AbortSignal.timeout(8000) })
    return res.ok ? { published: true } : { published: false, reason: `hook_${res.status}` }
  } catch (e) {
    return { published: false, reason: e instanceof Error ? e.name : 'hook_failed' }
  }
}
