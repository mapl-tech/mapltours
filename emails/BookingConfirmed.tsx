import { Heading, Text, Link, Hr } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface BookingConfirmedProps {
  bookingRef: string
  firstName: string | null
  totalPaid: number
  currency: string
  pickup: string | null
  dropoff: string | null
  phone: string | null
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
      weekday: 'long',
      month: 'long',
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
 * Transactional email sent from the Stripe webhook on payment_intent.succeeded.
 * Contains the voucher essentials: booking ref, each experience with date,
 * pickup/dropoff, and how to reach the ops team.
 */
export default function BookingConfirmed({
  bookingRef,
  firstName,
  totalPaid,
  currency,
  pickup,
  dropoff,
  phone,
  items,
}: BookingConfirmedProps) {
  const name = firstName?.trim() || 'there'
  const travelerTotal = items.reduce((sum, i) => sum + i.travelers, 0)

  return (
    <MaplLayout
      preheader={`Booking confirmed — ${bookingRef} · Jamaica trip details inside`}
    >
      <Text style={{ ...s.kicker, color: '#00A550' }}>Booking confirmed</Text>
      <Heading style={s.heading}>{name}, Jamaica is yours.</Heading>
      <Text style={s.body}>
        Payment received. Your booking reference is{' '}
        <strong style={{ color: '#fff' }}>{bookingRef}</strong>. This email is
        your voucher — save it or screenshot it for your guide. Each experience
        below includes its date, location, and traveler count.
      </Text>

      {/* Itinerary */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>Your itinerary · {items.length} experience{items.length !== 1 ? 's' : ''}</Text>
        {items.map((item, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 12 : 18 }}>
            <Text
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
                lineHeight: 1.4,
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.65)',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
              }}
            >
              {item.destination} · {formatDate(item.date)}
            </Text>
            <Text
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.65)',
                fontFamily: 'Helvetica Neue, Arial, sans-serif',
              }}
            >
              {item.travelers} traveler{item.travelers !== 1 ? 's' : ''} ·{' '}
              <span style={{ color: '#FFB300', fontWeight: 600 }}>
                {formatMoney(item.linePrice, currency)}
              </span>
            </Text>
          </div>
        ))}
      </div>

      {/* Pickup / logistics */}
      {(pickup || dropoff) && (
        <div style={s.panel}>
          <Text style={s.panelKicker}>Pickup &amp; drop-off</Text>
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
          {phone && (
            <Text style={s.panelBody}>
              <strong style={{ color: '#fff' }}>Contact number:</strong> {phone}
            </Text>
          )}
        </div>
      )}

      {/* Total paid */}
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
          {travelerTotal} traveler{travelerTotal !== 1 ? 's' : ''} · total paid
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

      <div style={s.ctaWrap}>
        <Link href={`${siteUrl()}/profile`} style={s.cta}>
          View my bookings →
        </Link>
      </div>

      {/* Before-you-go */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>Before you go</Text>
        <Text style={s.panelBody}>
          · Your guide will reach out 24–48 hours before each experience with
          meeting details.
          <br />· Bring a valid ID, reef-safe sunscreen, and water.
          <br />· Free cancellation up to 48 hours before each experience — just
          reply to this email.
        </Text>
      </div>

      <Text style={s.footnote}>
        Questions? Reply to this email, any time. Our team on the ground will
        get back to you in hours, not days.
      </Text>
    </MaplLayout>
  )
}
