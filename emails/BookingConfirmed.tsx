import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface BookingConfirmedProps {
  bookingRef: string
  firstName: string | null
  lastName?: string | null
  email?: string | null
  phone: string | null
  country?: string | null
  pickup: string | null
  dropoff: string | null
  specialRequests?: string | null
  /** Itemized line totals + breakdown, server fills in whatever it has. */
  subtotal?: number | null
  bookingFee?: number | null
  transportCost?: number | null
  rewardDiscount?: number | null
  totalPaid: number
  currency: string
  paidAt?: string | null
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
    pricePerPerson?: number
    linePrice: number
  }>
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${currency === 'USD' ? '$' : `${currency} `}${abs}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

/**
 * Shopify-style traveler confirmation. Single-column, white card,
 * tabular receipt, same shape Shopify uses for order confirmation.
 */
export default function BookingConfirmed(props: BookingConfirmedProps) {
  const {
    bookingRef,
    firstName,
    email,
    phone,
    country,
    pickup,
    dropoff,
    specialRequests,
    subtotal,
    bookingFee,
    transportCost,
    rewardDiscount,
    totalPaid,
    currency,
    paidAt,
    items,
  } = props
  const name = firstName?.trim() || 'there'
  // Tours are sold at one all-in price: `subtotal` is the operator's cost and
  // `bookingFee` is MAPL's margin, so neither is shown. Transport and reward
  // ARE the customer's own lines and still render.
  void subtotal
  void bookingFee
  const showBreakdown =
    (transportCost != null && transportCost > 0) ||
    (rewardDiscount != null && rewardDiscount > 0)
  const paidAtPretty = fmtDateTime(paidAt)
  const customerLines = [
    [firstName, props.lastName].filter(Boolean).join(' ').trim() || null,
    email ?? null,
    phone ?? null,
    country ?? null,
  ].filter(Boolean) as string[]

  return (
    <MaplLayout preheader={`Booking confirmed · ${bookingRef} · Jamaica trip details inside`}>
      <Text style={s.eyebrow}>✓ Booking confirmed</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        Thank you, {name}.
      </Heading>
      <Text style={s.heroLead}>
        Your booking is confirmed. Save this email. Your guide will reference{' '}
        <strong style={{ color: '#1a1a1a' }}>{bookingRef}</strong> when they
        reach out.
      </Text>

      {/* Booking ref + view button */}
      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>
      <Section style={s.ctaWrap}>
        <Link href={`${siteUrl()}/profile`} style={s.cta}>
          View your booking
        </Link>
      </Section>

      {/* Itinerary card */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            Itinerary · {items.length} experience{items.length !== 1 ? 's' : ''}
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
                <Text style={s.bodyMuted}>
                  {item.destination} · {fmtDate(item.date)}
                </Text>
                <Text style={{ ...s.bodyMuted, marginTop: 2 }}>
                  {item.travelers} traveler{item.travelers !== 1 ? 's' : ''}
                  {item.pricePerPerson != null
                    ? ` · ${fmtMoney(item.pricePerPerson, currency)} each`
                    : ''}
                </Text>
              </Column>
              <Column style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }} className="mapl-stack-col">
                <Text style={{ ...s.rowValue, fontWeight: 600 }}>
                  {fmtMoney(item.linePrice, currency)}
                </Text>
              </Column>
            </Row>
          </Section>
        ))}
      </Section>

      {/* Order summary */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Payment summary</Text>
        </Section>
        <Section style={s.cardBody}>
          {showBreakdown && (
            <>
              {transportCost != null && transportCost > 0 && (
                <BreakdownLine label="Private transport" value={fmtMoney(transportCost, currency)} />
              )}
              {rewardDiscount != null && rewardDiscount > 0 && (
                <BreakdownLine
                  label="Reward discount"
                  value={`− ${fmtMoney(rewardDiscount, currency)}`}
                  emphasis="emerald"
                />
              )}
            </>
          )}
          <div style={s.totalRow}>
            <Text style={s.totalLabel}>
              Total paid
              {paidAtPretty && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: 400,
                    color: '#9a9a9a',
                    letterSpacing: 0,
                  }}
                >
                  {paidAtPretty}
                </span>
              )}
            </Text>
            <Text style={s.totalValue}>{fmtMoney(totalPaid, currency)}</Text>
          </div>
        </Section>
      </Section>

      {/* Customer details */}
      {customerLines.length > 0 && (
        <Section style={s.card}>
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Your details</Text>
          </Section>
          <Section style={s.cardBody}>
            {customerLines.map((line, i) => (
              <Text key={i} style={s.body}>
                {line}
              </Text>
            ))}
          </Section>
        </Section>
      )}

      {/* Pickup & drop-off */}
      {(pickup || dropoff) && (
        <Section style={s.card}>
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Pickup &amp; drop-off</Text>
          </Section>
          <Section style={s.cardBody}>
            {pickup && (
              <Text style={s.body}>
                <strong style={{ fontWeight: 600 }}>Pickup:</strong> {pickup}
              </Text>
            )}
            {dropoff && dropoff !== pickup && (
              <Text style={{ ...s.body, marginTop: 6 }}>
                <strong style={{ fontWeight: 600 }}>Drop-off:</strong> {dropoff}
              </Text>
            )}
          </Section>
        </Section>
      )}

      {/* Special requests, highlighted card */}
      {specialRequests && (
        <Section style={s.card}>
          <Section style={s.highlightCardHeader}>
            <Text style={s.highlightCardHeaderText}>Special requests</Text>
          </Section>
          <Section style={s.cardBody}>
            <Text style={{ ...s.body, whiteSpace: 'pre-wrap' }}>
              {specialRequests}
            </Text>
          </Section>
        </Section>
      )}

      {/* What happens next */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Before you go</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={s.body}>
            · Your guide will reach out 24–48 hours before each experience with
            the meeting point.
          </Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Bring a valid ID, reef-safe sunscreen, and water.
          </Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Free cancellation up to 48 hours before each experience. Just
            reply to this email.
          </Text>
          <Text style={s.note}>
            Questions? Reply to this email any time. Our team on the ground
            answers in hours, not days.
          </Text>
        </Section>
      </Section>
    </MaplLayout>
  )
}

function BreakdownLine({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: 'emerald'
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        margin: '0 0 8px',
      }}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={{
          ...s.rowValue,
          color: emphasis === 'emerald' ? '#1d7a50' : s.rowValue.color,
          fontWeight: emphasis === 'emerald' ? 600 : (s.rowValue.fontWeight as number) || 400,
        }}
      >
        {value}
      </Text>
    </div>
  )
}
