/**
 * Schema guard for the checkout APIs.
 *
 * Adversarial-review fix: previously, if migration 005/006/007 hadn't been
 * applied to production, the booking insert just failed with a generic
 * 500 ("Could not create booking"), which made incident triage slow.
 *
 * `assertCheckoutSchema()` queries the `bookings_schema_health` view added
 * in migration 007 once per process and short-circuits with an actionable
 * error if any expected column or index is missing. The result is cached
 * on the module object so we don't pay a round-trip per request.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface SchemaHealth {
  has_booking_type: boolean
  has_cart_hash: boolean
  has_item_type: boolean
  has_unique_pending_index: boolean
  /** Migration 010/011. OPTIONAL feature flag, absence must never throw:
   *  attribution is garnish, so routes skip the write instead of failing. */
  has_attribution?: boolean
  /** Migration 020. Same contract as has_attribution: absence must not throw. */
  has_pickup_time?: boolean
}

export interface SchemaFeatures {
  /** True only when bookings.attribution exists, so inserts may include it. */
  hasAttribution: boolean
  hasPickupTime: boolean
}

export class SchemaNotReadyError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Booking schema not ready, missing: ${missing.join(', ')}`)
    this.name = 'SchemaNotReadyError'
    this.missing = missing
  }
}

let cached: SchemaFeatures | null = null

/** Throws SchemaNotReadyError if any required migration column/index is absent.
 *  Returns the OPTIONAL feature flags (currently hasAttribution) so routes can
 *  gate best-effort writes on what the live schema actually supports. */
export async function assertCheckoutSchema(
  supabase: SupabaseClient,
): Promise<SchemaFeatures> {
  if (cached) return cached

  const { data, error } = await supabase
    .from('bookings_schema_health')
    .select('*')
    .maybeSingle<SchemaHealth>()

  if (error) {
    // The view itself is missing → migration 007 not applied.
    throw new SchemaNotReadyError([
      'bookings_schema_health view (migration 007)',
    ])
  }
  if (!data) {
    throw new SchemaNotReadyError(['bookings_schema_health view returned no rows'])
  }

  const missing: string[] = []
  if (!data.has_booking_type) missing.push('bookings.booking_type (migration 006)')
  if (!data.has_cart_hash) missing.push('bookings.cart_hash (migration 005)')
  if (!data.has_item_type) missing.push('booking_items.item_type (migration 006)')
  if (!data.has_unique_pending_index)
    missing.push('bookings_pending_session_unique (migration 007)')

  if (missing.length > 0) throw new SchemaNotReadyError(missing)

  // `=== true` matters: on a deploy that lands before the migration, the view
  // has no such column, the field is undefined, and the flag must read false
  // so the optional write is skipped rather than 500ing the checkout.
  cached = {
    hasAttribution: data.has_attribution === true,
    hasPickupTime: data.has_pickup_time === true,
  }
  return cached
}
