import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, supportEmail } from './_Layout'

export interface RefundRequestedProps {
  bookingRef: string
  firstName: string | null
  totalPaid: number
  refundAmount: number
  adminCharge: number
  currency: string
  isTransfer?: boolean
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${Math.abs(n).toFixed(2)}`
}

/**
 * Acknowledgement that a cancellation request was received.
 *
 * Deliberately careful about tense: nothing has been refunded and the trip is
 * still booked. Saying "cancelled" here would have travelers skip a trip that
 * is still live if the request is later declined.
 */
export default function RefundRequested({
  bookingRef, firstName, totalPaid, refundAmount, adminCharge, currency, isTransfer = false,
}: RefundRequestedProps) {
  const noun = isTransfer ? 'transfer' : 'booking'
  return (
    <MaplLayout preheader={`We have your cancellation request for ${bookingRef}`}>
      <Text style={{ ...s.eyebrow, color: '#6E6A62' }}>Cancellation requested</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        We have your request
      </Heading>
      <Text style={s.heroLead}>
        {firstName ? `${firstName}, we` : 'We'}&rsquo;ve received your request to cancel {bookingRef} and
        our team is reviewing it. <strong>Nothing has been refunded yet, and your {noun} is
        still booked</strong> until we confirm.
      </Text>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>If approved, you would receive</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Amount paid</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{fmtMoney(totalPaid, currency)}</Text></Column>
          </Row>
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Administration charge (20%)</Text></Column>
            <Column align="right"><Text style={s.rowValue}>&minus;{fmtMoney(adminCharge, currency)}</Text></Column>
          </Row>
          <Row style={s.totalRow}>
            <Column><Text style={s.totalLabel}>Refund</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(refundAmount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      <Text style={s.note}>
        This is the amount quoted when you asked, and it is the amount we will
        honour even if the review takes a while. We will email you either way.
        Reference {bookingRef}.
      </Text>

      <Text style={s.footnote}>
        Need it sooner? Reply here or email{' '}
        <Link href={`mailto:${supportEmail()}`}>{supportEmail()}</Link>.
      </Text>
    </MaplLayout>
  )
}
