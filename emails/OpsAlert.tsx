import { Heading, Text, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface OpsAlertProps {
  /** One-line statement of what broke, e.g. "Paid bookings stuck in pending". */
  title: string
  /** Plain-language explanation of what this means and what to do. */
  body: string
  /** One line per affected record: booking ref, PI id, amounts — whatever ops needs to act. */
  lines: string[]
}

/**
 * Internal incident alert. Sent to the operations inbox when an automated
 * safety net catches something a human must resolve — a paid booking the
 * webhook never flipped, a confirmation email that exhausted its retries.
 * Deliberately plain: the recipient is us, and the content is the point.
 */
export default function OpsAlert({ title, body, lines }: OpsAlertProps) {
  return (
    <MaplLayout preheader={title}>
      <Text style={s.eyebrow}>Automated ops alert</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {title}
      </Heading>
      <Text style={s.heroLead}>{body}</Text>
      <Section style={s.card}>
        {lines.map((line, i) => (
          <Text
            key={i}
            // NOT cardHeaderText: that token uppercases, and these lines
            // carry case-sensitive Stripe ids and booking UUIDs that must
            // render verbatim. Mono face so ids read as ids.
            style={{
              margin: '6px 16px',
              fontFamily: "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
              fontSize: 13,
              lineHeight: '20px',
              color: '#6B6B6B',
            }}
          >
            {line}
          </Text>
        ))}
      </Section>
    </MaplLayout>
  )
}
