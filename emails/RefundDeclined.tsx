import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s, supportEmail } from './_Layout'

export interface RefundDeclinedProps {
  bookingRef: string
  firstName: string | null
  isTransfer?: boolean
  /** Optional admin note. Omitted entirely when absent, never faked. */
  reason?: string | null
}

/**
 * A cancellation request was refused.
 *
 * The important message is that the booking is STILL LIVE, so the traveler
 * turns up rather than writing the trip off. The reason is shown verbatim
 * when ops gave one; no boilerplate is invented in its place.
 */
export default function RefundDeclined({
  bookingRef, firstName, isTransfer = false, reason,
}: RefundDeclinedProps) {
  const noun = isTransfer ? 'transfer' : 'booking'
  return (
    <MaplLayout preheader={`About your cancellation request for ${bookingRef}`}>
      <Text style={{ ...s.eyebrow, color: '#6E6A62' }}>Cancellation reviewed</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        Your {noun} is still booked
      </Heading>
      <Text style={s.heroLead}>
        {firstName ? `${firstName}, we` : 'We'}&rsquo;ve reviewed your request to cancel {bookingRef} and
        we&rsquo;re not able to refund it. No money has been taken or returned, and
        your {noun} remains confirmed &mdash; please still come.
      </Text>

      {reason && (
        <Section style={s.card} className="mapl-card">
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Why</Text>
          </Section>
          <Section style={s.cardBody} className="mapl-pad">
            <Text style={s.body}>{reason}</Text>
          </Section>
        </Section>
      )}

      <Text style={s.note}>
        If you think this is wrong, or something has changed, reply to this
        email and a person will look at it again. Reference {bookingRef}.
      </Text>

      <Text style={s.footnote}>
        Email <Link href={`mailto:${supportEmail()}`}>{supportEmail()}</Link>.
      </Text>
    </MaplLayout>
  )
}
