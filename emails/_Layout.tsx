import {
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
 * MAPL Tours — Shopify-style light email layout.
 *
 * Aesthetics:
 *  • White card on a soft gray surface (#F6F6F6).
 *  • Wordmark band at the top, plain footer at the bottom.
 *  • System font stack for cross-client legibility.
 *  • Conservative type sizes — 14–16px body, 24–32px headings.
 *  • Mobile-responsive via @media queries on the inline <style> block.
 *    The outer container is capped at 600px; inner padding tightens on
 *    narrow screens and 2-column rows collapse to a single column.
 */

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
          /* Mobile tweaks — applied by clients that respect <style>. */
          @media (max-width: 480px) {
            .mapl-card {
              border-radius: 0 !important;
              border-left-width: 0 !important;
              border-right-width: 0 !important;
            }
            .mapl-pad {
              padding-left: 20px !important;
              padding-right: 20px !important;
            }
            .mapl-pad-y {
              padding-top: 28px !important;
              padding-bottom: 28px !important;
            }
            .mapl-h1 { font-size: 24px !important; line-height: 1.2 !important; }
            .mapl-h2 { font-size: 14px !important; }
            .mapl-stack-col {
              display: block !important;
              width: 100% !important;
              padding: 0 !important;
            }
            .mapl-stack-col + .mapl-stack-col {
              margin-top: 16px !important;
            }
            .mapl-item-img {
              width: 56px !important;
              height: 56px !important;
            }
          }
        `}</style>
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={body}>
        <Container style={container} className="mapl-card">
          {/* Wordmark band */}
          <Section style={brandBand} className="mapl-pad">
            <Text style={brandWordmark}>MAPL TOURS</Text>
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
              MAPL Tours · Kingston · Negril · Ocho Rios · Portland
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

/* ───────────────── Shared style tokens — Shopify palette ───────────────── */

export const maplStyles = {
  /* Page-level headline above the order card. */
  hero: {
    margin: 0,
    fontFamily: SYSTEM_SERIF(),
    fontWeight: 600,
    fontSize: 28,
    lineHeight: 1.18,
    letterSpacing: '-0.01em',
    color: '#1a1a1a',
  } as React.CSSProperties,
  heroLead: {
    margin: '12px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 15,
    lineHeight: 1.6,
    color: '#525252',
  } as React.CSSProperties,
  /* Section header — small uppercase label above each card. */
  sectionLabel: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#6b6b6b',
  },
  /* The white card surface used by every section block. */
  card: {
    margin: '20px 0 0',
    padding: 0,
    background: '#ffffff',
    border: '1px solid #e7e7e7',
    borderRadius: 8,
    overflow: 'hidden',
  } as React.CSSProperties,
  cardHeader: {
    padding: '14px 18px',
    borderBottom: '1px solid #ececec',
    background: '#fafafa',
  } as React.CSSProperties,
  cardHeaderText: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#6b6b6b',
  } as React.CSSProperties,
  cardBody: {
    padding: '16px 18px',
  } as React.CSSProperties,
  /* Stronger card body padding for hero summary blocks. */
  cardBodyLg: {
    padding: '20px 22px',
  } as React.CSSProperties,
  /* Body copy inside cards. */
  body: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 14.5,
    lineHeight: 1.55,
    color: '#1a1a1a',
  } as React.CSSProperties,
  bodyMuted: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 13.5,
    lineHeight: 1.55,
    color: '#6b6b6b',
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
    color: '#525252',
  } as React.CSSProperties,
  rowValue: {
    margin: 0,
    fontFamily: SYSTEM_MONO_NUM(),
    fontSize: 14,
    color: '#1a1a1a',
    fontVariantNumeric: 'tabular-nums' as const,
  } as React.CSSProperties,
  /* Total row — heavier weight, larger size. */
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 12,
    marginTop: 12,
    borderTop: '1px solid #ececec',
  } as React.CSSProperties,
  totalLabel: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 15,
    fontWeight: 600,
    color: '#1a1a1a',
  } as React.CSSProperties,
  totalValue: {
    margin: 0,
    fontFamily: SYSTEM_MONO_NUM(),
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#1a1a1a',
    fontVariantNumeric: 'tabular-nums' as const,
  } as React.CSSProperties,
  /* Booking-reference pill. */
  refPill: {
    display: 'inline-block',
    padding: '8px 14px',
    background: '#fafafa',
    border: '1px solid #e7e7e7',
    borderRadius: 6,
    fontFamily: SYSTEM_MONO(),
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: '#1a1a1a',
  } as React.CSSProperties,
  /* Primary call-to-action — near-black for the premium read. */
  ctaWrap: {
    margin: '20px 0 4px',
  } as React.CSSProperties,
  cta: {
    display: 'inline-block',
    padding: '13px 28px',
    background: '#1a1a1a',
    color: '#ffffff',
    borderRadius: 6,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: SYSTEM_SANS(),
    letterSpacing: '-0.005em',
  } as React.CSSProperties,
  /* Footnote inside cards. */
  note: {
    margin: '12px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 12.5,
    color: '#9a9a9a',
    lineHeight: 1.5,
  } as React.CSSProperties,
  /* Highlighted "special requests" block. */
  highlightCardHeader: {
    padding: '14px 18px',
    borderBottom: '1px solid #f3e3a6',
    background: '#fffaeb',
  } as React.CSSProperties,
  highlightCardHeaderText: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#7a5a08',
  } as React.CSSProperties,

  /* ──────────────────────────────────────────────────────────
     Legacy token aliases — kept so the video/reward email
     templates continue to compile without a full redesign. They
     map onto the Shopify-light tokens above so the resulting
     emails are visually consistent with the new receipts.
     ────────────────────────────────────────────────────────── */
  kicker: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#1d7a50',
  } as React.CSSProperties,
  heading: {
    margin: '8px 0 14px',
    fontFamily: SYSTEM_SERIF(),
    fontWeight: 600,
    fontSize: 28,
    lineHeight: 1.18,
    letterSpacing: '-0.01em',
    color: '#1a1a1a',
  } as React.CSSProperties,
  panel: {
    margin: '20px 0 0',
    padding: '16px 18px',
    background: '#fafafa',
    border: '1px solid #ececec',
    borderRadius: 8,
  } as React.CSSProperties,
  panelKicker: {
    margin: 0,
    fontFamily: SYSTEM_SANS(),
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#6b6b6b',
  } as React.CSSProperties,
  panelBody: {
    margin: '8px 0 0',
    fontFamily: SYSTEM_SANS(),
    fontSize: 14,
    lineHeight: 1.55,
    color: '#1a1a1a',
  } as React.CSSProperties,
  codePill: {
    display: 'inline-block',
    padding: '10px 16px',
    background: '#fafafa',
    border: '1px solid #e7e7e7',
    borderRadius: 6,
    fontFamily: SYSTEM_MONO(),
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#1a1a1a',
  } as React.CSSProperties,
  ctaGhost: {
    display: 'inline-block',
    padding: '11px 24px',
    background: '#ffffff',
    color: '#1a1a1a',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: SYSTEM_SANS(),
  } as React.CSSProperties,
  footnote: {
    marginTop: 22,
    fontSize: 12,
    color: '#9a9a9a',
    textAlign: 'center' as const,
    lineHeight: 1.55,
    fontFamily: SYSTEM_SANS(),
  } as React.CSSProperties,
}

/* ───────────────── Internal styles ───────────────── */

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  background: '#f6f6f6',
  fontFamily: SYSTEM_SANS(),
  color: '#1a1a1a',
  WebkitFontSmoothing: 'antialiased',
}

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  margin: '24px auto',
  background: '#ffffff',
  border: '1px solid #ececec',
  borderRadius: 10,
  overflow: 'hidden',
}

const brandBand: React.CSSProperties = {
  padding: '24px 32px 18px',
  borderBottom: '1px solid #ececec',
  background: '#ffffff',
}

const brandWordmark: React.CSSProperties = {
  margin: 0,
  fontFamily: SYSTEM_SANS(),
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.18em',
  color: '#1a1a1a',
}

const brandTagline: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: SYSTEM_SERIF(),
  fontStyle: 'italic',
  fontSize: 12,
  color: '#6b6b6b',
}

const bodyPad: React.CSSProperties = {
  padding: '32px 32px 8px',
}

const hr: React.CSSProperties = {
  borderColor: '#ececec',
  margin: 0,
}

const footerPad: React.CSSProperties = {
  padding: '24px 32px 28px',
  textAlign: 'center' as const,
  background: '#fafafa',
}

const footerLine: React.CSSProperties = {
  margin: '0 0 6px',
  fontFamily: SYSTEM_SANS(),
  fontSize: 12,
  color: '#6b6b6b',
  lineHeight: 1.5,
}

const footerLineMuted: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: SYSTEM_SANS(),
  fontSize: 11,
  color: '#9a9a9a',
  lineHeight: 1.5,
}

const footerLink: React.CSSProperties = {
  color: '#1a1a1a',
  textDecoration: 'none',
  fontWeight: 500,
}

/* ───────────────── Helpers ───────────────── */

function SYSTEM_SANS(): string {
  return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
}

function SYSTEM_SERIF(): string {
  return "Georgia, 'Times New Roman', Times, serif"
}

function SYSTEM_MONO(): string {
  return "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
}

/** Sans-serif with tabular numerals — used for prices so columns align. */
function SYSTEM_MONO_NUM(): string {
  return SYSTEM_SANS()
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapltours.com'
}

export function supportEmail(): string {
  return process.env.EMAIL_SUPPORT ?? 'support@mapltours.com'
}

function hostname(): string {
  try {
    return new URL(siteUrl()).hostname.replace(/^www\./, '')
  } catch {
    return 'mapltours.com'
  }
}
