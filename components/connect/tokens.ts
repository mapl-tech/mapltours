/**
 * What /connect adds to the site's tokens, in one place. The gold tint marks
 * the path to act: the selected assistant, the step numbers, the requests to
 * copy and the payoff card, with its edge outlining them. Illustrations never
 * wear it (the chat's own messages are neutral), so nothing inert looks like
 * a request button. Filled near-black is left to the copy buttons alone.
 *
 * Links: LINK (LINK_BLOCK for the long ones) on light grounds, LINK_ON_DARK
 * on the dark card (STANDALONE_ON_DARK when it stands outside a sentence).
 *
 * Shadow depth by role, from the site's ramp: --shadow-xs for list cards and
 * chat bubbles, --shadow-sm for the step panels and the closing card,
 * --shadow-md for the one address card at the top.
 *
 * Type: 16px body; supporting text at SUPPORT_SIZE (16px on a phone, 15px on
 * a wide screen); labels 15px; nothing smaller (the one exception is the
 * site's own phone rule, which sets every .btn-primary label at 14.5px).
 * Every h3 tracks at -0.01em: H3 below at 17px, the step panels' title at 19px.
 */
import type { CSSProperties } from 'react'

export const FONT = 'var(--font-dm-sans)'

export const GOLD_TINT = 'rgba(201, 169, 78, 0.16)'
/** The tint under a pointer, for the request buttons. */
export const GOLD_TINT_HOVER = 'rgba(201, 169, 78, 0.28)'
export const GOLD_EDGE = 'rgba(201, 169, 78, 0.5)'

/**
 * Supporting text (notes, sources, card copy, the requests to copy): 16px up
 * to 800px wide, so nothing a phone reader needs is under the 16px floor,
 * easing to 15px by 1200px, where it sits under 16px body text.
 */
export const SUPPORT_SIZE = 'clamp(15px, calc(18px - 0.25vw), 16px)'

/** The page's h3: card titles, "Try asking", the chat example's title. */
export const H3: CSSProperties = {
  margin: 0,
  fontFamily: FONT,
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1.35,
  letterSpacing: '-0.01em',
  color: 'var(--text-primary)',
}

/**
 * Every text link on a light ground: underlined, weight 600. Links carry the
 * site's .tap-target, whose 46px touch zone is centred on the link's box; a
 * link that broke across two lines would get it in the wrong place, so these
 * never wrap. A link too long for one line uses LINK_BLOCK instead.
 */
export const LINK: CSSProperties = {
  color: 'var(--text-primary)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

/** A long link (the vendor help pages): one box that wraps inside itself, so its touch zone covers every line. */
export const LINK_BLOCK: CSSProperties = { ...LINK, display: 'inline-block', whiteSpace: 'normal' }

/** The same link on the dark card, in the gold that reads on #111110 (10:1). */
export const LINK_ON_DARK: CSSProperties = { ...LINK, color: 'var(--gold-warm)' }

/**
 * A dark-card link that stands on its own rather than inside a sentence: a
 * 44px box, so two of them wrapping onto separate rows never share a touch
 * zone (in a sentence, a 320px screen stacked them on adjacent lines).
 */
export const STANDALONE_ON_DARK: CSSProperties = { ...LINK_ON_DARK, display: 'inline-flex', alignItems: 'center', minHeight: 44 }
