import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl, supportEmail } from './_Layout'

export interface GiftCardDeliveredProps {
  code: string
  amount: number
  currency: string
  recipientName?: string | null
  senderName?: string | null
  message?: string | null
  /** ISO date the card stops being spendable. */
  expiresAt?: string | null
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${Math.abs(n).toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

/**
 * The gift card itself, delivered to the recipient.
 *
 * The code is the whole point of this email, so it gets the largest, most
 * copyable treatment on the page and is repeated nowhere else in a way that
 * could be mistaken for it. Everything else — who it is from, the message,
 * how to spend it — arranges around that.
 */
export default function GiftCardDelivered({
  code, amount, currency, recipientName, senderName, message, expiresAt,
}: GiftCardDeliveredProps) {
  return (
    <MaplLayout
      preheader={`${senderName ? `${senderName} sent you` : 'You have received'} a ${fmtMoney(amount, currency)} MAPL Tours Jamaica gift card`}
    >
      <Text style={s.eyebrow}>A gift for you</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        {recipientName ? `${recipientName}, you` : 'You'}&rsquo;ve been given Jamaica
      </Heading>
      <Text style={s.heroLead}>
        {senderName ? `${senderName} has sent you` : 'Someone has sent you'}{' '}
        a {fmtMoney(amount, currency)} gift card for MAPL Tours Jamaica, good for
        guided experiences, private airport transfers, and days out across the island.
      </Text>

      {message && (
        <Section style={s.card} className="mapl-card">
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>
              {senderName ? `Message from ${senderName}` : 'Their message'}
            </Text>
          </Section>
          <Section style={s.cardBody} className="mapl-pad">
            <Text style={{ ...s.body, fontStyle: 'italic' }}>&ldquo;{message}&rdquo;</Text>
          </Section>
        </Section>
      )}

      {/* The code. Large, spaced, and on its own so it survives being
          screenshotted, forwarded or read down a phone. */}
      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Your gift card code</Text>
        </Section>
        <Section style={{ ...s.cardBodyLg, textAlign: 'center' as const }} className="mapl-pad">
          <Text style={{ ...s.codePill, fontSize: 22, letterSpacing: '0.12em' }}>{code}</Text>
          <Row style={{ ...s.totalRow, marginTop: 18 }}>
            <Column><Text style={s.totalLabel}>Value</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(amount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      <Section style={s.ctaWrap}>
        <Link href={`${siteUrl()}/explore`} style={s.cta}>
          Start planning
        </Link>
      </Section>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>How to use it</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Text style={s.body}>
            1. Choose your experiences or an airport transfer at{' '}
            <Link href={siteUrl()}>mapltours.com</Link>.
          </Text>
          <Text style={{ ...s.body, marginTop: 8 }}>
            2. At checkout, enter the code above in the gift card field.
          </Text>
          <Text style={{ ...s.body, marginTop: 8 }}>
            3. The value comes straight off your total. If your trip costs less
            than the card, the rest stays on it for next time.
          </Text>
        </Section>
      </Section>

      <Text style={s.note}>
        You can spend it across more than one booking until the balance runs
        out. Booking an experience needs a quick free account; airport
        transfers don&rsquo;t.
        {expiresAt ? ` Valid until ${fmtDate(expiresAt)}.` : ''} Keep this email.
        The code is the card.
      </Text>

      <Text style={s.footnote}>
        Questions? Email <Link href={`mailto:${supportEmail()}`}>{supportEmail()}</Link>.
      </Text>
    </MaplLayout>
  )
}
