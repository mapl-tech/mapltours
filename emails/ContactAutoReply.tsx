import { Heading, Section, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface ContactAutoReplyProps {
  firstName?: string | null
  /** Mirror the subject the visitor typed, so they remember which thread this is. */
  subject?: string | null
  /** Echo the message back so they have a copy of what they sent. */
  message: string
}

/**
 * Branded auto-reply sent to anyone who submits the contact form on
 * mapltours.com. Confirms receipt, sets expectation on response time,
 * and mirrors the original message back so the visitor has a record.
 */
export default function ContactAutoReply({
  firstName,
  subject,
  message,
}: ContactAutoReplyProps) {
  const name = firstName?.trim() || 'there'

  return (
    <MaplLayout preheader="We received your message, we'll be in touch within one business day.">
      <Text style={s.kicker}>Message received</Text>
      <Heading style={s.heading}>Thanks, {name}, we got it.</Heading>
      <Text style={s.heroLead}>
        Your message just landed in our inbox. A real person on the MAPL Tours
        Tours team reads every contact form submission, and we&rsquo;ll get
        back to you within <strong>one business day</strong> (often much
        sooner).
      </Text>

      {subject ? (
        <Section style={s.card}>
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Subject</Text>
          </Section>
          <Section style={s.cardBody}>
            <Text style={s.body}>{subject}</Text>
          </Section>
        </Section>
      ) : null}

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>What you sent us</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={{ ...s.body, whiteSpace: 'pre-wrap' }}>{message}</Text>
        </Section>
      </Section>

      <Text style={{ ...s.body, marginTop: 24 }}>
        If your trip is coming up fast and you need an answer the same day,
        reply to this email and put <strong>URGENT</strong> in the subject line,
        it&rsquo;ll bump straight to the top of the queue.
      </Text>

      <Text style={s.note}>
        This is an automated confirmation, but replies go to a real inbox
        watched by our team in Jamaica.
      </Text>
    </MaplLayout>
  )
}
