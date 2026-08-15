import { Heading, Text, Section, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to the guest on the DAY of a transfer, once the driver is assigned.
 *
 * The confirmation email (TransferConfirmed) is sent at booking, often weeks
 * earlier, and by the day of travel a guest is on a plane with no itinerary to
 * hand. This one answers only what matters in the next few hours: who is
 * meeting me, what do they look like, where do I find them, and who do I
 * message if I cannot. Everything else is deliberately left out.
 *
 * Driver fields come from the dispatch console; when a detail has not been
 * recorded yet the email says so plainly rather than printing a blank.
 */

export interface TransferDayOfProps {
  bookingRef: string
  firstName: string | null
  /** 'arrival' = airport pickup, 'departure' = hotel pickup for the flight home. */
  leg: 'arrival' | 'departure'
  /** Pretty Jamaica-time string, already formatted by the caller. */
  whenLabel: string
  /** 'Today' or 'Tomorrow'. Dawn pickups are mailed the evening before, so the
   *  copy must not assert "today" without being told it is true. */
  dayLabel: 'Today' | 'Tomorrow'
  /** Where the driver meets them. */
  pickupLabel: string
  dropoffLabel: string
  flight: string | null
  passengers: number
  driverName: string | null
  driverPhone: string | null
  driverVehicle: string | null
  driverPlate: string | null
  supportEmail: string
}

/** Numbered steps as a real list: the order carries meaning, so it is marked
 *  up as a sequence rather than faked with "1." in the copy. */
const stepList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  color: '#57534C',
  fontSize: 14.5,
  lineHeight: 1.6,
}
const stepItem: React.CSSProperties = { margin: '0 0 8px' }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ padding: '9px 0', borderBottom: '1px solid #f0f0f0' }}>
      <Text style={{ ...s.sectionLabel, margin: 0 }}>{label}</Text>
      <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

export default function TransferDayOf(props: TransferDayOfProps) {
  const {
    bookingRef, firstName, leg, whenLabel, dayLabel, pickupLabel, dropoffLabel,
    flight, passengers, driverName, driverPhone, driverVehicle, driverPlate,
    supportEmail,
  } = props
  // Name the driver where we have it; never assume a pronoun for them.
  const driver = driverName?.trim() || 'Your driver'
  const isToday = dayLabel === 'Today'
  const name = firstName?.trim() || 'there'
  const isArrival = leg === 'arrival'
  const waLink = driverPhone
    ? `https://wa.me/${driverPhone.replace(/[^\d]/g, '')}`
    : null

  return (
    <MaplLayout preheader={`${dayLabel}: your MAPL driver, ${whenLabel} · ${bookingRef}`}>
      <Text style={s.eyebrow}>{dayLabel} · {isArrival ? 'Airport pickup' : 'Departure pickup'}</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {isArrival
          ? (isToday ? `Welcome to Jamaica, ${name}.` : `See you tomorrow, ${name}.`)
          : `Safe travels, ${name}.`}
      </Heading>
      <Text style={s.heroLead}>
        {isArrival
          ? `${driver} will be waiting in the arrivals area with a MAPL Tours sign showing your name. Take your time through immigration and baggage: we watch your flight, so your driver already knows if it lands early or late.`
          : `${driver} will collect you from your hotel ${isToday ? 'today' : 'tomorrow'} and take you back to Sangster International, and will be outside at the time below.`}
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>

      {/* The one thing they need at a glance */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Your driver</Text>
        </Section>
        <Section style={s.cardBody}>
          <Row label="Name" value={driverName || 'Being confirmed, we will message you'} />
          <Row label="Vehicle" value={driverVehicle || 'Being confirmed'} />
          <Row label="License plate" value={driverPlate || 'Being confirmed'} />
          {driverPhone && (
            <Section style={{ padding: '9px 0' }}>
              <Text style={{ ...s.sectionLabel, margin: 0 }}>Driver WhatsApp</Text>
              <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>
                {waLink ? <Link href={waLink} style={{ color: '#1a1a1a' }}>{driverPhone}</Link> : driverPhone}
              </Text>
            </Section>
          )}
        </Section>
      </Section>

      {/* The run itself */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>{isArrival ? 'Your pickup' : 'Your departure'}</Text>
        </Section>
        <Section style={s.cardBody}>
          <Row label={isArrival ? 'Flight lands' : 'Hotel pickup'} value={`${whenLabel} Jamaica time`} />
          <Row label="Pick up" value={pickupLabel} />
          <Row label="Drop off" value={dropoffLabel} />
          {flight && <Row label="Flight" value={flight.toUpperCase()} />}
          <Section style={{ padding: '9px 0' }}>
            <Text style={{ ...s.sectionLabel, margin: 0 }}>Passengers</Text>
            <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{passengers}</Text>
          </Section>
        </Section>
      </Section>

      {/* What to do on the ground */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>{isArrival ? 'When you land' : 'Before you go'}</Text>
        </Section>
        <Section style={s.cardBody}>
          <ol style={stepList}>
            {(isArrival
              ? [
                  <>Clear immigration and collect your bags. No rush, we are tracking the flight.</>,
                  <>Walk out through customs into the arrivals hall.</>,
                  <>Look for the <strong>MAPL Tours</strong> sign with your name on it.</>,
                  <>If you do not see it within a few minutes, message {driver} on WhatsApp above, or reply to this email and we will call the driver for you.</>,
                ]
              : [
                  <>Be in the lobby a few minutes before the pickup time above.</>,
                  <>Your driver will be outside in the vehicle listed above.</>,
                  <>If anything changes with your flight or your plans, reply to this email and we will let your driver know and adjust the pickup for you.</>,
                ]
            ).map((step, i) => (
              <li key={i} style={stepItem}>{step}</li>
            ))}
          </ol>
        </Section>
      </Section>

      <Text style={s.note}>
        Anything at all, reply to this email or write to {supportEmail} and a
        person will answer. Booking reference {bookingRef}.
      </Text>
    </MaplLayout>
  )
}
