import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS — **server-only**.
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
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for service-role Supabase access.'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
