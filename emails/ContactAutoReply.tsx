import { Heading, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface ContactAutoReplyProps {
  /** Already checked to be a name (lib/guest-name), or null. */
  firstName?: string | null
}

/**
 * Branded auto-reply sent to anyone who submits the contact form on
 * mapltours.com. Confirms receipt and sets expectation on response time.
 *
 * It carries nothing the visitor typed except a first name that passed the
 * name rule. The address is unverified, so anything echoed here (a link, a
 * phone number, a "your account is locked" line) would be delivered to a
 * stranger from our domain. It used to echo the subject and the message.
 */
export default function ContactAutoReply({ firstName }: ContactAutoReplyProps) {
  const name = firstName?.trim() || 'there'

  return (
    <MaplLayout preheader="Got your message, we'll be in touch within one business day.">
      <Text style={s.kicker}>Message received</Text>
      <Heading style={s.heading}>Thanks, {name}, we got it.</Heading>
      <Text style={s.heroLead}>
        Your message just landed in our inbox. A real person on the MAPL Tours
        Jamaica team reads every message that comes in, and we&rsquo;ll get
        back to you within <strong>one business day</strong> (often much
        sooner).
      </Text>

      <Text style={{ ...s.body, marginTop: 24 }}>
        If your trip is coming up fast and you need an answer the same day,
        reply to this email and put <strong>URGENT</strong> in the subject line.
        It&rsquo;ll land in front of us before anything else.
      </Text>

      <Text style={s.note}>
        This is an automated confirmation. Replies go to a real inbox read by
        the MAPL Tours Jamaica team.
      </Text>
    </MaplLayout>
  )
}
