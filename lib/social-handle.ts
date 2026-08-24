/**
 * Guest social attribution, display-only.
 *
 * A guest may type an Instagram or TikTok handle (or link TikTok, which
 * writes a verified one). These helpers give every surface the same two
 * rules: one normalized shape for stored handles, and one display
 * precedence for bylines: handle, else first name, else the surface's own
 * fallback word. A handle renders with a leading @; a name never does,
 * so "Leshan" stops dressing up as "@Leshan Patterson".
 *
 * Pure functions only. Nothing here touches booking, checkout or webhooks.
 */

/** 2-30 chars of lowercase letters, digits, dot, underscore: the shared
 *  subset of Instagram's and TikTok's username alphabets, and the shape
 *  migration 026 enforces on public.users.social_handle. */
export const SOCIAL_HANDLE_RE = /^[a-z0-9._]{2,30}$/

/** Normalize typed input to the stored shape: trim, strip leading @s,
 *  lowercase. Returns null for empty or invalid input. Accepts unknown so
 *  values straight out of user_metadata (untyped) can never throw here. */
export function normalizeSocialHandle(input: unknown): string | null {
  if (typeof input !== 'string' || !input) return null
  const cleaned = input.trim().replace(/^@+/, '').toLowerCase()
  if (!cleaned) return null
  return SOCIAL_HANDLE_RE.test(cleaned) ? cleaned : null
}

export interface GuestLabel {
  /** The text to render, WITHOUT any @ prefix. */
  text: string
  /** True when text is a social handle and should render as @text. */
  isHandle: boolean
}

/** Byline precedence: handle, else first name, else fallback. */
export function guestLabel(
  handle: string | null | undefined,
  name: string | null | undefined,
  fallback: string,
): GuestLabel {
  // Tolerate un-normalized legacy values rather than trusting the column.
  const h = normalizeSocialHandle(handle)
  if (h) return { text: h, isHandle: true }
  const first = (name || '').trim().split(/\s+/)[0]
  if (first) return { text: first, isHandle: false }
  return { text: fallback, isHandle: false }
}

/** guestLabel, pre-rendered: "@handle" or "First" or fallback. */
export function formatGuestLabel(
  handle: string | null | undefined,
  name: string | null | undefined,
  fallback: string,
): string {
  const l = guestLabel(handle, name, fallback)
  return l.isHandle ? `@${l.text}` : l.text
}
