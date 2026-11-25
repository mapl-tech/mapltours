import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'
import { partyFooter, signName } from '../lib/travel-party'

/**
 * A travel party member's copy of a booking confirmation (lib/travel-party).
 *
 * The person who booked added this address after paying. So this is the trip
 * and nothing else: no price, no payment, none of the booker's contact
 * details, no notes from the booking, no way to cancel (only the booker can),
 * no offers. It ends by saying why it came and how to stop these emails, and
 * the message carries a one-click List-Unsubscribe to the same link.
 */

export interface TravelPartyTripProps {
  bookingRef: string
  /** The booker's first name, or null when the booking gives none. */
  addedBy: string | null
  kind: 'transfer' | 'tour'
  transfers: Array<{
    destination: string
    tripType: 'one_way' | 'round_trip'
    passengers: number
    arrivalAt: string | null
    arrivalFlight: string | null
    departureAt: string | null
    departureFlight: string | null
  }>
  tours: Array<{ title: string; destination: string; date: string; travelers: number }>
  /** Where a tour picks the party up, as the booker gave it. */
  pickup: string | null
  supportEmail: string
  stopUrl: string
}

// Leg times are the booking's Jamaica wall clock: read in UTC so no mail
// client's zone moves them (as TransferConfirmed does).
function fmtLeg(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

// A tour day is a calendar day: read at noon UTC so no zone moves it.
function fmtDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? '')) return 'Date to be confirmed'
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const legLabel = { ...s.sectionLabel, textTransform: 'none' as const, letterSpacing: 0 }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function TravelPartyTrip(p: TravelPartyTripProps) {
  const who = p.addedBy ?? 'Someone you are traveling with'
  const isRide = p.kind === 'transfer'
  const departureOnly = isRide && !p.transfers.some((t) => t.arrivalAt) && p.transfers.some((t) => t.departureAt)
  const lead = isRide
    ? `${who} booked ${p.transfers.length > 1 ? 'these airport rides' : 'this airport ride'} with MAPL Tours Jamaica and asked us to send you the details. Before pickup, we will email you the driver's name, plate and WhatsApp too.`
    : `${who} booked ${p.tours.length > 1 ? 'these tours' : 'this tour'} with MAPL Tours Jamaica and asked us to send you the details.`

  return (
    <MaplLayout preheader={`Your trip details · ${p.bookingRef}`} title="Your trip details">
      <Text style={s.eyebrow}>Trip details</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {isRide ? 'Your airport ride is booked.' : 'Your Jamaica tour is booked.'}
      </Heading>
      <Text className="mapl-body" style={s.heroLead}>{lead}</Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{p.bookingRef}</span>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>
            {isRide ? `Itinerary · ${plural(p.transfers.length, 'ride', 'rides')}` : `Itinerary · ${plural(p.tours.length, 'tour', 'tours')}`}
          </Heading>
        </Section>
        {isRide
          ? p.transfers.map((t, i) => (
              <Section key={i} style={{ padding: '18px 20px', borderTop: i === 0 ? 'none' : '1px solid #F1ECE3' }}>
                <Text className="mapl-body" style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>{t.destination}</Text>
                <Text className="mapl-note" style={s.bodyMuted}>
                  {t.tripType === 'round_trip' ? 'Round trip' : 'One way'} · {plural(t.passengers, 'passenger', 'passengers')}
                </Text>
                {t.arrivalAt && (
                  <Section style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid #E7E1D6' }}>
                    <Text style={legLabel}>Arrival · Sangster International (MBJ) to the hotel</Text>
                    <Text className="mapl-body" style={{ ...s.body, marginTop: 2 }}>
                      {fmtLeg(t.arrivalAt)} Jamaica time{t.arrivalFlight ? ` · flight ${t.arrivalFlight.toUpperCase()}` : ''}
                    </Text>
                  </Section>
                )}
                {t.departureAt && (
                  <Section style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #E7E1D6' }}>
                    <Text style={legLabel}>Departure · the hotel to Sangster International (MBJ)</Text>
                    <Text className="mapl-body" style={{ ...s.body, marginTop: 2 }}>
                      Hotel pickup {fmtLeg(t.departureAt)} Jamaica time{t.departureFlight ? ` · flight ${t.departureFlight.toUpperCase()}` : ''}
                    </Text>
                  </Section>
                )}
              </Section>
            ))
          : p.tours.map((t, i) => (
              <Section key={i} style={{ padding: '18px 20px', borderTop: i === 0 ? 'none' : '1px solid #F1ECE3' }}>
                <Text className="mapl-body" style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>{t.title}</Text>
                <Text className="mapl-note" style={s.bodyMuted}>
                  {fmtDay(t.date)} · {t.destination} · {plural(t.travelers, 'traveler', 'travelers')}
                </Text>
              </Section>
            ))}
        {!isRide && p.pickup && (
          <Section style={{ padding: '14px 20px 18px', borderTop: '1px solid #F1ECE3' }}>
            <Text style={legLabel}>Pickup</Text>
            <Text className="mapl-body" style={{ ...s.body, marginTop: 2 }}>{p.pickup}</Text>
          </Section>
        )}
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>
            {isRide ? (departureOnly ? 'Before you go' : 'On arrival at MBJ') : 'Before you go'}
          </Heading>
        </Section>
        <Section style={s.cardBody}>
          <ul style={s.steps}>
            {isRide && !departureOnly && (
              <>
                <li className="mapl-body" style={{ ...s.step, marginTop: 0 }}>Clear immigration and collect your bags.</li>
                <li className="mapl-body" style={s.step}>
                  Exit the terminal at arrivals. Your driver will be waiting with a MAPL Tours Jamaica sign showing {signName(p.addedBy)}.
                </li>
              </>
            )}
            {isRide && departureOnly && (
              <li className="mapl-body" style={{ ...s.step, marginTop: 0 }}>
                Be in the lobby a few minutes before the pickup time. Your driver will be waiting outside the hotel.
              </li>
            )}
            {!isRide && (
              <>
                <li className="mapl-body" style={{ ...s.step, marginTop: 0 }}>
                  Your guide confirms the pickup time with {p.addedBy ?? 'the person who booked'} 24 to 48 hours before.
                </li>
                <li className="mapl-body" style={s.step}>Bring a valid ID, reef-safe sunscreen and water.</li>
              </>
            )}
            <li className="mapl-body" style={s.step}>
              Questions about the trip? Write to{' '}
              <Link href={`mailto:${p.supportEmail}`} style={{ color: '#1A1714', textDecoration: 'underline' }}>{p.supportEmail}</Link>{' '}
              with the booking reference {p.bookingRef}.
            </li>
          </ul>
        </Section>
      </Section>

      <Text className="mapl-note" style={{ ...s.note, marginTop: 28 }}>
        {partyFooter(p.addedBy)}{' '}
        <Link href={p.stopUrl} style={{ color: '#1A1714', textDecoration: 'underline' }}>Stop these emails</Link>
      </Text>
    </MaplLayout>
  )
}
