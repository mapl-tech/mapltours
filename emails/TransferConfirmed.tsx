import { Heading, Text, Link, Hr } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface TransferConfirmedProps {
  bookingRef: string
  firstName: string | null
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
  customerPhone: string | null
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
 * Traveler-facing confirmation for airport transfers. Each transfer is
 * rendered as an arrival / departure block so the driver and the customer
 * share the same reference document.
 */
export default function TransferConfirmed({
  bookingRef,
  firstName,
  totalPaid,
  currency,
  transfers,
  customerPhone,
}: TransferConfirmedProps) {
  const name = firstName?.trim() || 'there'

  return (
    <MaplLayout
      preheader={`Transfer confirmed — ${bookingRef} · your Jamaica airport ride details`}
    >
      <Text style={{ ...s.kicker, color: '#00A550' }}>Transfer confirmed</Text>
      <Heading style={s.heading}>{name}, your ride is booked.</Heading>
      <Text style={s.body}>
        Your private transfer{transfers.length > 1 ? 's' : ''} {transfers.length > 1 ? 'are' : 'is'}{' '}
        confirmed. Booking reference{' '}
        <strong style={{ color: '#fff' }}>{bookingRef}</strong>. Keep this email
        handy — your driver will look for it.
      </Text>

      {transfers.map((t, i) => (
        <div key={i} style={{ ...s.panel, marginTop: i === 0 ? 24 : 16 }}>
          <Text style={s.panelKicker}>
            Transfer · Zone {t.zone} · {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'}
          </Text>

          <Text
            style={{
              margin: '8px 0 14px',
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'Helvetica Neue, Arial, sans-serif',
            }}
          >
            {t.destination}
          </Text>

          {/* Arrival leg */}
          {t.arrivalAt && (
            <div style={{ marginBottom: t.tripType === 'round_trip' && t.departureAt ? 14 : 0 }}>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                Arrival · MBJ → hotel
              </Text>
              <Text
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                {formatDateTime(t.arrivalAt)}
                {t.arrivalFlight ? ` · flight ${t.arrivalFlight}` : ''}
              </Text>
            </div>
          )}

          {/* Departure leg */}
          {t.tripType === 'round_trip' && t.departureAt && (
            <div>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                Departure · hotel → MBJ
              </Text>
              <Text
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'Helvetica Neue, Arial, sans-serif',
                }}
              >
                {formatDateTime(t.departureAt)}
                {t.departureFlight ? ` · flight ${t.departureFlight}` : ''}
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
            {t.passengers} passenger{t.passengers !== 1 ? 's' : ''} ·{' '}
            <span style={{ color: '#FFB300', fontWeight: 600 }}>
              {formatMoney(t.priceUsd, currency)}
            </span>
          </Text>
        </div>
      ))}

      <Hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '22px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <Text
          style={{
            margin: 0,
            fontSize: 14,
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
          }}
        >
          Total paid
        </Text>
        <Text
          style={{
            margin: 0,
            fontFamily: 'Georgia, \'Times New Roman\', serif',
            fontWeight: 800,
            fontSize: 20,
            color: '#FFB300',
          }}
        >
          {formatMoney(totalPaid, currency)}
        </Text>
      </div>

      {/* On-the-day instructions */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>On arrival at MBJ</Text>
        <Text style={s.panelBody}>
          · Clear immigration and collect your bags.
          <br />· Exit the terminal at arrivals — your driver will be at the
          MAPL Tours sign with your name.
          <br />· If you can&rsquo;t see your driver, call{' '}
          <strong style={{ color: '#fff' }}>+1 (876) 000-0000</strong> (24/7
          dispatch).
          {customerPhone && (
            <>
              <br />· We have your number{' '}
              <strong style={{ color: '#fff' }}>{customerPhone}</strong> on file
              for WhatsApp updates.
            </>
          )}
        </Text>
      </div>

      <div style={s.ctaWrap}>
        <Link href={`${siteUrl()}/explore`} style={s.cta}>
          Add tours to your trip →
        </Link>
      </div>

      <Text style={s.footnote}>
        Free cancellation up to 24 hours before arrival — just reply to this
        email. Safe travels.
      </Text>
    </MaplLayout>
  )
}
