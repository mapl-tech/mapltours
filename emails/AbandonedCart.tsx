import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface AbandonedCartProps {
  firstName: string | null
  /** Human booking reference, shown so support can tie a reply to the cart. */
  bookingRef: string
  currency: string
  /** Grand total they were about to pay. */
  total: number
  /** Where "Finish booking" points (explore for tours, transfers for rides). */
  ctaUrl: string
  ctaLabel: string
  /** What they left behind. `sub` is a short second line (destination, date). */
  items: Array<{ title: string; sub: string; price: number }>
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${currency === 'USD' ? '$' : `${currency} `}${abs}`
}

/**
 * Abandoned-cart recovery. Sent once, a while after a checkout was started
 * but never paid. Warm, low pressure, one clear button back to finish.
 */
export default function AbandonedCart(props: AbandonedCartProps) {
  const { firstName, bookingRef, currency, total, ctaUrl, ctaLabel, items } = props
  const name = firstName?.trim() || 'there'

  return (
    <MaplLayout preheader={`Your Jamaica trip is still saved, ${name}. Pick up where you left off.`}>
      <Text style={s.eyebrow}>Your trip is saved</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        Still thinking it over, {name}?
      </Heading>
      <Text style={s.heroLead}>
        Your spot is still held. Everything you picked is right where you left
        it, so you can finish whenever you are ready. Prices are locked in USD,
        and you will not be charged until you check out.
      </Text>

      <Section style={s.ctaWrap}>
        <Link href={ctaUrl} style={s.cta}>
          {ctaLabel}
        </Link>
      </Section>

      {/* What they left behind */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            In your cart · {items.length} item{items.length !== 1 ? 's' : ''}
          </Text>
        </Section>
        {items.map((item, i) => (
          <Section
            key={i}
            style={{
              padding: '16px 18px',
              borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
            }}
          >
            <Row>
              <Column style={{ verticalAlign: 'top', paddingRight: 12 }} className="mapl-stack-col">
                <Text style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>
                  {item.title}
                </Text>
                {item.sub ? <Text style={s.bodyMuted}>{item.sub}</Text> : null}
              </Column>
              <Column style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }} className="mapl-stack-col">
                <Text style={{ ...s.rowValue, fontWeight: 600 }}>
                  {fmtMoney(item.price, currency)}
                </Text>
              </Column>
            </Row>
          </Section>
        ))}
        <Section style={s.cardBody}>
          <div style={s.totalRow}>
            <Text style={s.totalLabel}>Your total</Text>
            <Text style={s.totalValue}>{fmtMoney(total, currency)}</Text>
          </div>
        </Section>
      </Section>

      {/* Reassurance */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Why book with MAPL TOURS</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={s.body}>· Local guides who actually know the island.</Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Private transport and a full itinerary, arranged for you.
          </Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Flexible cancellation within 48 hours of booking, less a 20%
            administration charge plus taxes (if applicable).
          </Text>
          <Text style={s.note}>
            Questions before you book? Reply to this email any time. Reference{' '}
            {bookingRef}. No problem.
          </Text>
        </Section>
      </Section>

      <Section style={{ margin: '18px 0 0' }}>
        <Link href={siteUrl()} style={{ ...s.bodyMuted, textDecoration: 'underline' }}>
          Browse more experiences
        </Link>
      </Section>
    </MaplLayout>
  )
}
