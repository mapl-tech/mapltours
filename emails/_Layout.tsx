import {
  Img,
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Preview,
} from '@react-email/components'

/**
 * MAPL Tours transactional email shell.
 *
 * Single-family system to match the site: DM Sans everywhere (with a graceful
 * system-sans fallback, since most mail clients will not load a web font).
 * Warm off-white surface, a hairline gold accent as the only ornament, and a
 * near-black ink for a quiet, premium read. No serif, no filler.
 *
 * Every token key that older templates (video / reward / contact) consume is
 * preserved, so they inherit this refreshed look without edits.
 */

/* ── Palette ── */
const INK = '#1A1714' // primary text, warm near-black
const INK_SOFT = '#57534C' // secondary text
const MUTED = '#6E6A62' // notes / muted (kept ≥ AA on white)
const FAINT = '#6E6A62' // © line; AA on both paper (4.78:1) and card (5.38:1)
const BG = '#F4F1EB' // warm page ground
const CARD = '#FFFFFF'
const BORDER = '#E7E1D6' // warm hairline
const BORDER_SOFT = '#F1ECE3'
const GOLD = '#B7873A' // accent, rules/hairlines only, never body text
const GREEN = '#1D7A50' // success + reward discount
const FOOTER_BG = '#FAF8F3'

interface MaplLayoutProps {
  preheader: string
  children: React.ReactNode
}

export function MaplLayout({ preheader, children }: MaplLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`
          @media (max-width: 480px) {
            .mapl-card {
              border-radius: 0 !important;
              border-left-width: 0 !important;
              border-right-width: 0 !important;
            }
            .mapl-pad { padding-left: 22px !important; padding-right: 22px !important; }
            .mapl-pad-y { padding-top: 28px !important; padding-bottom: 28px !important; }
            .mapl-h1 { font-size: 26px !important; line-height: 1.15 !important; }
            .mapl-h2 { font-size: 14px !important; }
            .mapl-stack-col { display: block !important; width: 100% !important; padding: 0 !important; }
            .mapl-stack-col + .mapl-stack-col { margin-top: 14px !important; }
            .mapl-item-img { width: 56px !important; height: 56px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={body}>
        <Container style={container} className="mapl-card">
          {/* Gold letterhead accent */}
          <Section style={accentBar} />

          {/* Wordmark band */}
          <Section style={brandBand} className="mapl-pad">
            <Img
              src={`${siteUrl()}/mapl-logo-email.png`}
              alt="MAPL Tours Jamaica"
              width="128"
              height="47"
              style={brandLogo}
            />
            <Section style={brandRule} />
            <Text style={brandTagline}>Discover Jamaica beyond the resort</Text>
          </Section>

          {/* Body */}
          <Section style={bodyPad} className="mapl-pad mapl-pad-y">
            {children}
          </Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footerPad} className="mapl-pad">
            <Text style={footerLine}>
              MAPL Tours · Montego Bay · Falmouth · Ocho Rios · Negril
            </Text>
            <Text style={footerLine}>
              <Link href={siteUrl()} style={footerLink}>
                {hostname()}
              </Link>{' '}
              ·{' '}
              <Link href={`mailto:${supportEmail()}`} style={footerLink}>
                {supportEmail()}
              </Link>
            </Text>
            <Text style={footerLineMuted}>
              © {new Date().getFullYear()} MAPL Tours. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/* ───────────────── Shared style tokens ───────────────── */

export const maplStyles = {
  /* Small success eyebrow above the hero, e.g. "✓ Booking confirmed". */
  eyebrow: {
    margin: '0 0 12px',
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: GREEN,
  } as React.CSSProperties,
  /* Page-level headline above the order card. */
  hero: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontWeight: 700,
    fontSize: 30,
    lineHeight: 1.12,
    letterSpacing: '-0.022em',
    color: INK,
  } as React.CSSProperties,
  heroLead: {
    margin: '12px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 15,
    lineHeight: 1.6,
    color: INK_SOFT,
  } as React.CSSProperties,
  /* Section header, small uppercase label above each card. */
  sectionLabel: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: MUTED,
  },
  /* The white card surface used by every section block. */
  card: {
    margin: '18px 0 0',
    padding: 0,
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    overflow: 'hidden',
  } as React.CSSProperties,
  cardHeader: {
    padding: '13px 20px',
    borderBottom: `1px solid ${BORDER_SOFT}`,
    background: '#FCFBF8',
  } as React.CSSProperties,
  cardHeaderText: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: MUTED,
  } as React.CSSProperties,
  cardBody: {
    padding: '18px 20px',
  } as React.CSSProperties,
  /* Stronger card body padding for hero summary blocks. */
  cardBodyLg: {
    padding: '22px 22px',
  } as React.CSSProperties,
  /* Body copy inside cards. */
  body: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 14,
    lineHeight: 1.55,
    color: INK,
  } as React.CSSProperties,
  bodyMuted: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    lineHeight: 1.55,
    color: MUTED,
  } as React.CSSProperties,
  /* Two-column key/value pair, used for breakdown rows. */
  rowFlex: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    margin: '0 0 8px',
  } as React.CSSProperties,
  rowLabel: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 14,
    color: INK_SOFT,
  } as React.CSSProperties,
  rowValue: {
    margin: 0,
    fontFamily: SYSTEM_MONO_NUM(),
    fontSize: 14,
    color: INK,
    fontVariantNumeric: 'tabular-nums' as const,
  } as React.CSSProperties,
  /* Total row, heavier weight, larger size. */
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 14,
    marginTop: 14,
    borderTop: `1px solid ${BORDER_SOFT}`,
  } as React.CSSProperties,
  totalLabel: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 15,
    fontWeight: 600,
    color: INK,
  } as React.CSSProperties,
  totalValue: {
    margin: 0,
    fontFamily: SYSTEM_MONO_NUM(),
    fontSize: 23,
    fontWeight: 800,
    letterSpacing: '-0.015em',
    color: INK,
    fontVariantNumeric: 'tabular-nums' as const,
  } as React.CSSProperties,
  /* Booking-reference pill. */
  refPill: {
    display: 'inline-block',
    padding: '9px 15px',
    background: '#FCFBF8',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    fontFamily: SYSTEM_MONO(),
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: INK,
  } as React.CSSProperties,
  /* Primary call-to-action, near-black for the premium read. */
  ctaWrap: {
    margin: '20px 0 4px',
  } as React.CSSProperties,
  cta: {
    display: 'inline-block',
    padding: '14px 30px',
    background: INK,
    color: '#FFFFFF',
    borderRadius: 9999,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: SYSTEM_SANS(),
    letterSpacing: '-0.005em',
  } as React.CSSProperties,
  /* Footnote inside cards. */
  note: {
    margin: '14px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    color: MUTED,
    lineHeight: 1.5,
  } as React.CSSProperties,
  /* Highlighted "special requests" block. */
  highlightCardHeader: {
    padding: '13px 20px',
    borderBottom: '1px solid #F0E4BE',
    background: '#FCF6E4',
  } as React.CSSProperties,
  highlightCardHeaderText: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#7A5A08',
  } as React.CSSProperties,

  /* ──────────────────────────────────────────────────────────
     Legacy token aliases, kept so the video / reward / contact
     templates continue to compile. Mapped onto the tokens above
     so those emails match the refreshed receipts.
     ────────────────────────────────────────────────────────── */
  kicker: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: GREEN,
  } as React.CSSProperties,
  heading: {
    margin: '8px 0 14px',
    fontFamily: SYSTEM_SANS(),
    fontWeight: 700,
    fontSize: 30,
    lineHeight: 1.12,
    letterSpacing: '-0.022em',
    color: INK,
  } as React.CSSProperties,
  panel: {
    margin: '18px 0 0',
    padding: '16px 18px',
    background: '#FCFBF8',
    border: `1px solid ${BORDER_SOFT}`,
    borderRadius: 12,
  } as React.CSSProperties,
  panelKicker: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: MUTED,
  } as React.CSSProperties,
  panelBody: {
    margin: '8px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 14,
    lineHeight: 1.55,
    color: INK,
  } as React.CSSProperties,
  codePill: {
    display: 'inline-block',
    padding: '11px 17px',
    background: '#FCFBF8',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    fontFamily: SYSTEM_MONO(),
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: INK,
  } as React.CSSProperties,
  ctaGhost: {
    display: 'inline-block',
    padding: '12px 26px',
    background: '#FFFFFF',
    color: INK,
    border: `1px solid ${BORDER}`,
    borderRadius: 9999,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: SYSTEM_SANS(),
  } as React.CSSProperties,
  footnote: {
    marginTop: 22,
    fontSize: 13,
    color: MUTED,
    textAlign: 'center' as const,
    lineHeight: 1.55,
    fontFamily: SYSTEM_SANS(),
  } as React.CSSProperties,
}

/* ───────────────── Internal styles ───────────────── */

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  background: BG,
  fontFamily: SYSTEM_SANS(),
  color: INK,
  WebkitFontSmoothing: 'antialiased',
}

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  margin: '28px auto',
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  overflow: 'hidden',
}

const accentBar: React.CSSProperties = {
  height: 3,
  background: GOLD,
  fontSize: 13,
  lineHeight: '3px',
}

const brandBand: React.CSSProperties = {
  padding: '26px 32px 22px',
  borderBottom: `1px solid ${BORDER_SOFT}`,
  background: CARD,
}

const brandLogo: React.CSSProperties = {
  display: 'block',
  width: 128,
  height: 'auto',
  border: 0,
  // Outlook ignores CSS width on images without this.
  maxWidth: '100%',
}

const brandWordmark: React.CSSProperties = {
  margin: 0,
  fontFamily: SYSTEM_SANS(),
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '0.2em',
  color: INK,
}

const brandRule: React.CSSProperties = {
  height: 2,
  width: 34,
  background: GOLD,
  margin: '10px 0 0',
  fontSize: 13,
  lineHeight: '2px',
}

const brandTagline: React.CSSProperties = {
  margin: '10px 0 0',
  fontFamily: SYSTEM_SANS(),
  fontStyle: 'italic',
  fontSize: 13,
  color: MUTED,
}

const bodyPad: React.CSSProperties = {
  padding: '34px 32px 10px',
}

const hr: React.CSSProperties = {
  borderColor: BORDER_SOFT,
  margin: 0,
}

const footerPad: React.CSSProperties = {
  padding: '26px 32px 30px',
  textAlign: 'center' as const,
  background: FOOTER_BG,
}

const footerLine: React.CSSProperties = {
  margin: '0 0 6px',
  fontFamily: SYSTEM_SANS(),
  fontSize: 13,
  color: INK_SOFT,
  lineHeight: 1.5,
}

const footerLineMuted: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: SYSTEM_SANS(),
  fontSize: 13,
  color: FAINT,
  lineHeight: 1.5,
}

const footerLink: React.CSSProperties = {
  color: INK,
  textDecoration: 'none',
  fontWeight: 500,
}

/* ───────────────── Helpers ───────────────── */

function SYSTEM_SANS(): string {
  // 'DM Sans' first to match the site; graceful system-sans fallback for the
  // many clients that will not load a web font.
  return "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
}

function SYSTEM_MONO(): string {
  return "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
}

/** Sans with tabular numerals, used for prices so columns align. */
function SYSTEM_MONO_NUM(): string {
  return SYSTEM_SANS()
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapltours.com'
}

export function supportEmail(): string {
  return process.env.EMAIL_SUPPORT ?? 'contact@mapltours.com'
}

function hostname(): string {
  try {
    return new URL(siteUrl()).hostname.replace(/^www\./, '')
  } catch {
    return 'mapltours.com'
  }
}
