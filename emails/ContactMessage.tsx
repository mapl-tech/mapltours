import { Heading, Section, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface ContactMessageProps {
  name: string
  email: string
  subject: string
  message: string
  /** ISO timestamp of when the visitor hit submit */
  submittedAt: string
  /** Coarse origin for spam triage, IP / country if available */
  origin?: string | null
}

/**
 * Internal "new contact" alert. The submitter's email is set as the
 * Resend `replyTo` so hitting Reply in the inbox goes straight back to
 * them, no copy/paste needed.
 */
export default function ContactMessage({
  name,
  email,
  subject,
  message,
  submittedAt,
  origin,
}: ContactMessageProps) {
  const submittedPretty = new Date(submittedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return (
    <MaplLayout preheader={`New contact form message from ${name}`}>
      <Text style={s.kicker}>New message</Text>
      <Heading style={s.heading}>{subject || 'Contact form submission'}</Heading>
      <Text style={s.heroLead}>
        {name} just sent a message through the mapltours.com contact form. Hit
        Reply to write back, their address is set as this email&rsquo;s
        reply-to.
      </Text>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>From</Text>
        </Section>
        <Section style={s.cardBody}>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Name</Text>
            <Text style={s.rowValue}>{name}</Text>
          </Section>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue}>{email}</Text>
          </Section>
          <Section style={s.rowFlex}>
            <Text style={s.rowLabel}>Submitted</Text>
            <Text style={s.rowValue}>{submittedPretty}</Text>
          </Section>
          {origin ? (
            <Section style={s.rowFlex}>
              <Text style={s.rowLabel}>Origin</Text>
              <Text style={s.rowValue}>{origin}</Text>
            </Section>
          ) : null}
        </Section>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Message</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={{ ...s.body, whiteSpace: 'pre-wrap' }}>{message}</Text>
        </Section>
      </Section>

      <Text style={s.note}>
        This is an internal alert, the visitor has already been sent an
        automated confirmation that we received their message.
      </Text>
    </MaplLayout>
  )
}
