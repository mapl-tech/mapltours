import { Heading, Text, Hr } from '@react-email/components'
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

function formatDateTime(iso: string | null): string | null {
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

function formatMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${n.toFixed(2)}`
}

/**
 * Ops-facing alert for transfers. Highlights the dispatch-relevant info
 * (flight numbers, pickup/drop times) so a driver can be assigned without
 * any back-and-forth.
 */
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
      <Text style={{ ...s.kicker, color: '#FF5A36' }}>
        Transfer · driver dispatch required
      </Text>
      <Heading style={s.heading}>{bookingRef}</Heading>
      <Text style={s.body}>
        A paid airport transfer just landed. Assign the driver, confirm the
        vehicle, and flight-track arrival. Flight numbers and times are below.
      </Text>

      {/* Customer */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>Customer</Text>
        <Text style={s.panelBody}>
          <strong style={{ color: '#fff' }}>{customerName}</strong>
          <br />
          {customerEmail}
          {customerPhone && (
            <>
              <br />
              {customerPhone}
            </>
          )}
          {customerCountry && (
            <>
              <br />
              {customerCountry}
            </>
          )}
        </Text>
      </div>

      {transfers.map((t, i) => (
        <div
          key={i}
          style={{
            ...s.panel,
            marginTop: i === 0 ? 24 : 16,
            background: 'rgba(255, 179, 0, 0.04)',
            border: '1px solid rgba(255, 179, 0, 0.20)',
          }}
        >
          <Text style={s.panelKicker}>
            Zone {t.zone} · {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} · {t.passengers} pax
          </Text>
          <Text
            style={{
              margin: '8px 0 14px',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'Helvetica Neue, Arial, sans-serif',
            }}
          >
            {t.destination}
          </Text>

          {/* Arrival */}
          {t.arrivalAt && (
            <div style={{ marginBottom: 10 }}>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: '#FFB300',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                Arrival · MBJ → hotel
              </Text>
              <Text
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                {formatDateTime(t.arrivalAt)}
                {t.arrivalFlight ? ` · ${t.arrivalFlight}` : ' · (flight not provided)'}
              </Text>
            </div>
          )}

          {/* Departure */}
          {t.tripType === 'round_trip' && t.departureAt && (
            <div>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: '#FFB300',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                Departure · hotel → MBJ
              </Text>
              <Text
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                {formatDateTime(t.departureAt)}
                {t.departureFlight ? ` · ${t.departureFlight}` : ' · (flight not provided)'}
              </Text>
            </div>
          )}

          <Text
            style={{
              margin: '14px 0 0',
              fontSize: 12.5,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'Helvetica Neue, Arial, sans-serif',
            }}
          >
            Line total:{' '}
            <span style={{ color: '#FFB300', fontWeight: 600 }}>
              {formatMoney(t.priceUsd, currency)}
            </span>
          </Text>
        </div>
      ))}

      {specialRequests && (
        <div
          style={{
            ...s.panel,
            background: 'rgba(255, 90, 54, 0.06)',
            border: '1px solid rgba(255, 90, 54, 0.28)',
          }}
        >
          <Text style={s.panelKicker}>Special requests</Text>
          <Text style={s.panelBody}>{specialRequests}</Text>
        </div>
      )}

      <Hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '22px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <Text
          style={{
            margin: 0,
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
          }}
        >
          Payment captured via Stripe
        </Text>
        <Text
          style={{
            margin: 0,
            fontFamily: 'Georgia, \'Times New Roman\', serif',
            fontWeight: 800,
            fontSize: 18,
            color: '#FFB300',
          }}
        >
          {formatMoney(totalPaid, currency)}
        </Text>
      </div>

      <Text style={s.footnote}>
        Booking reference {bookingRef}. Fires automatically on
        payment_intent.succeeded — no reply needed on this email.
      </Text>
    </MaplLayout>
  )
}
