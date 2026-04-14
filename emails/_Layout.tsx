import {
  Html, Head, Body, Container, Section, Text, Link, Hr, Preview,
} from '@react-email/components'

/**
 * ────────────────────────────────────────────────────────────────────────
 *  MAPL Tours — Branded email layout
 * ────────────────────────────────────────────────────────────────────────
 *  Every transactional email imports <MaplLayout> so branding stays
 *  consistent. Ink background, gold accent, serif headline (Georgia as a
 *  safe Syne fallback because custom webfonts are unreliable in email
 *  clients), and a gold hairline top trim — the same prestige cue used
 *  on the checkout Day Builder card.
 */

interface MaplLayoutProps {
  preheader: string
  children: React.ReactNode
}

export function MaplLayout({ preheader, children }: MaplLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={body}>
        <Container style={outerContainer}>
          {/* Top gold hairline */}
          <div style={goldHairline} />

          {/* Logo + wordmark */}
          <Section style={{ padding: '40px 44px 0' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={logoTile}>M</td>
                  <td style={wordmark}>MAPL Tours</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Body — provided by each template */}
          <Section style={{ padding: '28px 44px 12px' }}>{children}</Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={{ padding: '20px 44px 28px', textAlign: 'center' }}>
            <Text style={footerTagline}>Discover Jamaica beyond the resort.</Text>
            <Text style={footerMeta}>
              MAPL Tours · Jamaica ·{' '}
              <Link href={siteUrl()} style={footerLink}>mapltours.com</Link>
              {' · '}
              <Link href={`mailto:${supportEmail()}`} style={footerLink}>{supportEmail()}</Link>
            </Text>
            <Text style={footerMeta}>© {new Date().getFullYear()} MAPL Tours. All rights reserved.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/* ───────────────── Shared style tokens ───────────────── */

export const maplStyles = {
  kicker: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: '#FFB300',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
  },
  heading: {
    margin: '10px 0 18px',
    fontFamily: 'Georgia, \'Times New Roman\', serif',
    fontWeight: 800,
    fontSize: 28,
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    color: '#ffffff',
  },
  body: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.55,
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
  },
  panel: {
    margin: '24px 0 0',
    padding: '18px 20px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
  },
  panelKicker: {
    margin: 0,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#FFB300',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
  },
  panelBody: {
    margin: '8px 0 0',
    fontSize: 14,
    lineHeight: 1.55,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
  },
  ctaWrap: {
    textAlign: 'center' as const,
    margin: '28px 0 8px',
  },
  cta: {
    display: 'inline-block',
    padding: '15px 36px',
    background: '#FFB300',
    color: '#08080A',
    borderRadius: 9999,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
    letterSpacing: '-0.005em',
  },
  ctaGhost: {
    display: 'inline-block',
    padding: '13px 30px',
    background: 'transparent',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: 9999,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
    letterSpacing: '-0.005em',
  },
  footnote: {
    marginTop: 22,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center' as const,
    lineHeight: 1.55,
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
  },
  codePill: {
    display: 'inline-block',
    padding: '10px 16px',
    background: 'rgba(255, 179, 0, 0.12)',
    border: '1px solid rgba(255, 179, 0, 0.4)',
    borderRadius: 10,
    fontFamily: 'Courier New, monospace',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#FFB300',
  },
}

/* ───────────────── Internal styles ───────────────── */

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  background: '#08080A',
  fontFamily: 'Helvetica Neue, Arial, sans-serif',
  color: '#ffffff',
  WebkitFontSmoothing: 'antialiased',
}

const outerContainer: React.CSSProperties = {
  maxWidth: 560,
  margin: '40px auto',
  background: '#0F0F12',
  border: '1px solid rgba(255, 179, 0, 0.14)',
  borderRadius: 20,
  overflow: 'hidden',
}

const goldHairline: React.CSSProperties = {
  height: 3,
  background: 'linear-gradient(90deg, rgba(255,179,0,0) 0%, #FFB300 50%, rgba(255,179,0,0) 100%)',
}

const logoTile: React.CSSProperties = {
  width: 44,
  height: 44,
  background: '#FFB300',
  borderRadius: 12,
  textAlign: 'center' as const,
  verticalAlign: 'middle' as const,
  fontFamily: 'Georgia, \'Times New Roman\', serif',
  fontSize: 22,
  fontWeight: 800,
  color: '#08080A',
  lineHeight: '44px',
}

const wordmark: React.CSSProperties = {
  paddingLeft: 12,
  fontFamily: 'Helvetica Neue, Arial, sans-serif',
  fontWeight: 800,
  fontSize: 20,
  letterSpacing: '0.14em',
  color: '#ffffff',
  textTransform: 'uppercase' as const,
  verticalAlign: 'middle' as const,
}

const hr: React.CSSProperties = {
  borderColor: 'rgba(255, 255, 255, 0.08)',
  margin: '16px 44px 0',
}

const footerTagline: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Georgia, \'Times New Roman\', serif',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '-0.005em',
  color: '#ffffff',
}

const footerMeta: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: 'Helvetica Neue, Arial, sans-serif',
  fontSize: 11,
  lineHeight: 1.6,
  color: 'rgba(255, 255, 255, 0.35)',
}

const footerLink: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.55)',
  textDecoration: 'none',
}

/* ───────────────── Helpers ───────────────── */

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapltours.com'
}

export function supportEmail(): string {
  return process.env.EMAIL_SUPPORT ?? 'support@mapltours.com'
}
