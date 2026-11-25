import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escapeLikePattern } from '@/lib/pg-like'
import { parseAllowlist, resolveDriverAccess, type AccessDenied, type DriverAccess, type DriverRow } from '@/lib/driver-access'

/** The saved driver columns the portal reads, with the role (migration 043). */
export const DRIVER_ROLE_COLS = 'id, name, whatsapp, vehicle, colour, plate, email, active, role, created_at, updated_at'

/**
 * The signed-in person's portal access, read from the session, the saved
 * drivers and the admins table (lib/driver-access says the rule). A read that
 * fails denies: the portal never opens on a guess.
 */
export async function getDriverAccess(): Promise<
  { ok: true; access: DriverAccess; userId: string } | { ok: false; denied: AccessDenied | 'unavailable'; email?: string }
> {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return { ok: false, denied: 'not_signed_in' }
  const svc = createServiceClient()
  const email = user.email.trim().toLowerCase()
  // ilike with the address escaped: an exact, case-insensitive match (a _ in an address is not a wildcard).
  const byEmail = (cols: string) => svc.from('drivers').select(cols).ilike('email', escapeLikePattern(email))
  const [first, { data: adminRow, error: adminErr }] = await Promise.all([
    byEmail(DRIVER_ROLE_COLS),
    svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  let { data: rows, error } = first
  // Before migration 043 there is no role column: every saved row reads as a
  // regular driver, and the allowlist still opens the portal as it always has.
  if (error && /role/.test(error.message ?? '') && /column/i.test(error.message ?? '')) {
    ;({ data: rows, error } = await byEmail(DRIVER_ROLE_COLS.replace(', role', '')))
  }
  if (error || adminErr) {
    console.error('[driver-access] could not read the drivers or admins', { error: error?.message ?? adminErr?.message })
    return { ok: false, denied: 'unavailable', email }
  }
  const res = resolveDriverAccess({
    email,
    confirmed: !!(user.email_confirmed_at || user.confirmed_at),
    rows: (rows ?? []) as unknown as DriverRow[],
    allowlist: parseAllowlist(process.env.DRIVER_ALLOWED_EMAILS),
    isAdmin: !!adminRow,
  })
  if (!res.ok) return { ok: false, denied: res.denied, email }
  return { ok: true, access: res.access, userId: user.id }
}
