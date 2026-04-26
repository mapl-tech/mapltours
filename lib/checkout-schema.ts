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
}

export class SchemaNotReadyError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Booking schema not ready — missing: ${missing.join(', ')}`)
    this.name = 'SchemaNotReadyError'
    this.missing = missing
  }
}

let cached: { ok: true } | null = null

/** Throws SchemaNotReadyError if any required migration column/index is absent. */
export async function assertCheckoutSchema(
  supabase: SupabaseClient,
): Promise<void> {
  if (cached) return

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

  cached = { ok: true }
}
