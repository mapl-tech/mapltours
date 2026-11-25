import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'
import { partyFooter } from '../lib/travel-party'

/**
 * A travel party member's notice that the trip they were sent is cancelled
 * (lib/travel-party). Someone who got the confirmation must not wait at
 * arrivals for a ride that is off. The trip only: no refund, no amounts, no
 * reason; those are the booker's.
 */

export interface TravelPartyCancelledProps {
  bookingRef: string
  addedBy: string | null
  isTransfer: boolean
  /** One line per ride or tour, e.g. "Airport ride · Sangster International (MBJ) to Riu Negril · Wed, Nov 25". */
  lines: string[]
  supportEmail: string
}

export default function TravelPartyCancelled(p: TravelPartyCancelledProps) {
  const thing = p.isTransfer ? (p.lines.length > 1 ? 'These airport rides are' : 'This airport ride is') : (p.lines.length > 1 ? 'These tours are' : 'This tour is')
  return (
    <MaplLayout preheader={`Cancelled · ${p.bookingRef}`} title="Trip cancelled">
      <Text style={s.eyebrow}>Trip cancelled</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {thing} cancelled.
      </Heading>
      <Text className="mapl-body" style={s.heroLead}>
        The booking below is cancelled, so there is nothing to look out for. If you have questions about it, ask{' '}
        {p.addedBy ?? 'the person who booked'} or write to{' '}
        <Link href={`mailto:${p.supportEmail}`} style={{ color: '#1A1714', textDecoration: 'underline' }}>{p.supportEmail}</Link>.
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{p.bookingRef}</span>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>Cancelled</Heading>
        </Section>
        <Section style={s.cardBody}>
          {p.lines.map((line, i) => (
            <Text key={i} className="mapl-body" style={{ ...s.body, margin: i === 0 ? 0 : '8px 0 0' }}>{line}</Text>
          ))}
        </Section>
      </Section>

      <Text className="mapl-note" style={{ ...s.note, marginTop: 28 }}>
        {partyFooter(p.addedBy)} This is the last email about this trip.
      </Text>
    </MaplLayout>
  )
}
