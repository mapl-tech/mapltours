/**
 * Escaping for PostgREST `like` / `ilike` filter values.
 *
 * PostgREST passes these straight through to SQL LIKE / ILIKE, where `%`
 * matches any run of characters and `_` matches any single one. A value
 * interpolated into such a filter is therefore a PATTERN, not a literal, and
 * any user-controlled part of it is a wildcard injection.
 *
 * This bit us on /api/profile/bookings, which matched a guest's bookings with
 * `email.ilike.${email}`. Underscores are ordinary in email addresses, so a
 * guest with a verified address of john_smith@gmail.com also matched
 * johnXsmith@gmail.com and was shown a stranger's trips. Measured against
 * production on 2026-09-09: `email=ilike.%@gmail_com` returned the same rows
 * as `%@gmail.com`, and the escaped form returned none.
 *
 * Postgres LIKE uses backslash as its default escape character, so prefixing
 * each metacharacter is enough. The backslash itself has to be escaped first,
 * which a single regex pass over all three characters handles.
 *
 * Do NOT wrap the result in double quotes inside an `or(...)` expression:
 * PostgREST stops honouring the backslash there and the wildcard comes back.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
