import { Heading, Text, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface TransferOperatorAlertProps {
  bookingRef: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  customerCountry: string | null
  specialRequests: string | null
  totalPaid: number
  currency: string
  paidAt?: string | null
  transfers: Array<{
    destination: string
    zone: string
    tripType: 'one_way' | 'round_trip'
    passengers: number
    priceUsd: number
    arrivalFlight: string | null
    arrivalAt: string | null
    departureFlight: string | null
    departureAt: string | null
  }>
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${n.toFixed(2)}`
}

function fmtDateTime(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function TransferOperatorAlert({
  bookingRef,
  customerName,
  customerEmail,
  customerPhone,
  customerCountry,
  specialRequests,
  totalPaid,
  currency,
  transfers,
}: TransferOperatorAlertProps) {
  return (
    <MaplLayout
      preheader={`Transfer dispatch · ${bookingRef} · ${transfers.length} ride${transfers.length !== 1 ? 's' : ''}`}
    >
      <Heading as="h1" style={s.hero} className="mapl-h1">
        Transfer dispatch · action required
      </Heading>
      <Text style={s.heroLead}>
        A paid airport transfer just landed. Assign the driver, confirm the
        vehicle, and flight-track arrival. Flight numbers and times are below.
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

      {/* Transfers, flight info per leg */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            Transfers · {transfers.length}
          </Text>
        </Section>
        {transfers.map((t, i) => (
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
                  {t.destination}
                </Text>
                <Text style={s.bodyMuted}>
                  Zone {t.zone} ·{' '}
                  {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
                  {t.passengers} pax
                </Text>
              </Column>
              <Column style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }} className="mapl-stack-col">
                <Text style={{ ...s.rowValue, fontWeight: 600 }}>
                  {fmtMoney(t.priceUsd, currency)}
                </Text>
              </Column>
            </Row>

            {t.arrivalAt && (
              <Section style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid #d4f0e0' }}>
                <Text style={s.sectionLabel}>Arrival · MBJ → hotel</Text>
                <Text style={{ ...s.body, marginTop: 2 }}>
                  {fmtDateTime(t.arrivalAt)}
                  {t.arrivalFlight ? ` · ${t.arrivalFlight}` : ' · (flight not provided)'}
                </Text>
              </Section>
            )}

            {t.tripType === 'round_trip' && t.departureAt && (
              <Section style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #fce9b8' }}>
                <Text style={s.sectionLabel}>Departure · hotel → MBJ</Text>
                <Text style={{ ...s.body, marginTop: 2 }}>
                  {fmtDateTime(t.departureAt)}
                  {t.departureFlight ? ` · ${t.departureFlight}` : ' · (flight not provided)'}
                </Text>
              </Section>
            )}
          </Section>
        ))}
      </Section>

      {/* Special requests */}
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
        Booking reference {bookingRef}. Fires automatically on
        payment_intent.succeeded, no reply needed on this email.
      </Text>
    </MaplLayout>
  )
}
