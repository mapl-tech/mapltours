import { Heading, Text, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface OperatorBookingAlertProps {
  bookingRef: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  customerCountry: string | null
  pickup: string | null
  dropoff: string | null
  specialRequests: string | null
  totalPaid: number
  currency: string
  paidAt?: string | null
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
    linePrice: number
  }>
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${n.toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Internal ops alert for tour bookings. Shopify-style layout, but the
 * "Special requests" card is highlighted to keep dispatch from missing it.
 */
export default function OperatorBookingAlert({
  bookingRef,
  customerName,
  customerEmail,
  customerPhone,
  customerCountry,
  pickup,
  dropoff,
  specialRequests,
  totalPaid,
  currency,
  items,
}: OperatorBookingAlertProps) {
  return (
    <MaplLayout
      preheader={`New booking · ${bookingRef} · ${items.length} experience${items.length !== 1 ? 's' : ''} · ${fmtMoney(totalPaid, currency)}`}
    >
      <Heading as="h1" style={s.hero} className="mapl-h1">
        New booking
      </Heading>
      <Text style={s.heroLead}>
        A traveler just paid. Assign the guide(s), confirm pickup logistics
        with the customer, and flag anything in the special requests that
        needs follow-up.
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>

      {/* Customer */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Customer</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={{ ...s.body, fontWeight: 600 }}>{customerName}</Text>
          <Text style={s.body}>{customerEmail}</Text>
          {customerPhone && <Text style={s.body}>{customerPhone}</Text>}
          {customerCountry && <Text style={s.body}>{customerCountry}</Text>}
        </Section>
      </Section>

      {/* Itinerary */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            Experiences · {items.length}
          </Text>
        </Section>
        {items.map((item, i) => (
          <Section
            key={i}
            style={{
              padding: '14px 18px',
              borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
            }}
          >
            <Row>
              <Column style={{ verticalAlign: 'top', paddingRight: 12 }} className="mapl-stack-col">
                <Text style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>
                  {item.title}
                </Text>
                <Text style={s.bodyMuted}>
                  {item.destination} · {fmtDate(item.date)} · {item.travelers} pax
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

      {/* Pickup / drop-off */}
      {(pickup || dropoff) && (
        <Section style={s.card}>
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Logistics</Text>
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

      {/* Special requests, highlighted */}
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

      {/* Total */}
      <Section style={s.card}>
        <Section style={s.cardBody}>
          <div style={s.rowFlex}>
            <Text style={s.rowLabel}>Payment captured via Stripe</Text>
            <Text style={{ ...s.totalValue, fontSize: 18 }}>
              {fmtMoney(totalPaid, currency)}
            </Text>
          </div>
        </Section>
      </Section>

      <Text style={s.note}>
        Booking reference {bookingRef}. This notification fires automatically
        on payment_intent.succeeded, no action needed on this email beyond
        operational follow-up.
      </Text>
    </MaplLayout>
  )
}
