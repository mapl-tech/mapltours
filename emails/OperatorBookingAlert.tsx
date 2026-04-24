import { Heading, Text, Hr } from '@react-email/components'
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
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
    linePrice: number
  }>
}

function formatDate(iso: string): string {
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

function formatMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${n.toFixed(2)}`
}

/**
 * Internal ops-facing notification fired from the Stripe webhook. Goes to
 * OPERATIONS_EMAIL (or EMAIL_SUPPORT as a fallback) so the on-the-ground team
 * knows a booking was paid and needs fulfillment assignment.
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
      preheader={`New booking · ${bookingRef} · ${items.length} experience${items.length !== 1 ? 's' : ''} · ${formatMoney(totalPaid, currency)}`}
    >
      <Text style={{ ...s.kicker, color: '#FFB300' }}>
        New booking · action required
      </Text>
      <Heading style={s.heading}>{bookingRef}</Heading>
      <Text style={s.body}>
        A traveler has just paid. Assign the guide(s), confirm pickup logistics
        with the customer, and flag anything in the special requests that needs
        follow-up.
      </Text>

      {/* Customer block */}
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

      {/* Items */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>Experiences · {items.length}</Text>
        {items.map((item, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 12 : 16 }}>
            <Text
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
              }}
            >
              {item.destination} · {formatDate(item.date)} · {item.travelers} pax ·{' '}
              <span style={{ color: '#FFB300', fontWeight: 600 }}>
                {formatMoney(item.linePrice, currency)}
              </span>
            </Text>
          </div>
        ))}
      </div>

      {/* Pickup / drop-off */}
      {(pickup || dropoff) && (
        <div style={s.panel}>
          <Text style={s.panelKicker}>Logistics</Text>
          {pickup && (
            <Text style={s.panelBody}>
              <strong style={{ color: '#fff' }}>Pickup:</strong> {pickup}
            </Text>
          )}
          {dropoff && dropoff !== pickup && (
            <Text style={s.panelBody}>
              <strong style={{ color: '#fff' }}>Drop-off:</strong> {dropoff}
            </Text>
          )}
        </div>
      )}

      {/* Special requests — highlighted so ops can't miss them */}
      {specialRequests && (
        <div
          style={{
            ...s.panel,
            background: 'rgba(255, 179, 0, 0.06)',
            border: '1px solid rgba(255, 179, 0, 0.28)',
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
        Booking reference {bookingRef}. This notification fires automatically on
        payment_intent.succeeded — no action needed on this email beyond
        operational follow-up.
      </Text>
    </MaplLayout>
  )
}
