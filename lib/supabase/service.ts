import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS, **server-only**.
 * Used by webhook handlers and cron routes that must read/write on behalf
 * of other users (e.g. looking up the uploader's email to send them mail).
 *
 * NEVER import this file from a client component or expose SUPABASE_SERVICE_ROLE_KEY
 * to the browser. Next.js will throw a build error if you try.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, required for service-role Supabase access.'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Next patches global fetch and caches GETs in its Data Cache, which for
      // a service-role client is always wrong: these callers are webhooks and
      // crons reading live booking state. Left on, a cron re-reads a snapshot
      // and cannot see a driver just assigned or an email just sent. Opt every
      // service-role query out of the cache.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
