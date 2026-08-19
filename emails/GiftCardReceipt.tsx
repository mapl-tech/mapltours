import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, supportEmail } from './_Layout'

export interface GiftCardReceiptProps {
  code: string
  amount: number
  currency: string
  recipientName?: string | null
  recipientEmail: string
  expiresAt?: string | null
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${Math.abs(n).toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

/**
 * Buyer's receipt.
 *
 * It repeats the code deliberately. If the buyer mistyped the recipient's
 * address, this is the only copy of what they paid for — without it they have
 * been charged for a code neither party can produce, and support has nothing
 * to work from either.
 */
export default function GiftCardReceipt({
  code, amount, currency, recipientName, recipientEmail, expiresAt,
}: GiftCardReceiptProps) {
  return (
    <MaplLayout preheader={`Your ${fmtMoney(amount, currency)} gift card is on its way to ${recipientEmail}`}>
      <Text style={s.eyebrow}>Gift card sent</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        That&rsquo;s on its way
      </Heading>
      <Text style={s.heroLead}>
        We&rsquo;ve emailed a {fmtMoney(amount, currency)} gift card to{' '}
        {recipientName ? `${recipientName} at ` : ''}
        <strong>{recipientEmail}</strong>. They can spend it on experiences and
        airport transfers, across as many bookings as it takes to use it up.
      </Text>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Receipt</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Sent to</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{recipientEmail}</Text></Column>
          </Row>
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Code</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{code}</Text></Column>
          </Row>
          <Row style={s.totalRow}>
            <Column><Text style={s.totalLabel}>Paid</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(amount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      <Text style={s.note}>
        Keep this email. If the address above is wrong, or the gift never
        arrives, reply here with the code and we will send it on. The code is
        the card, so nothing is lost.
        {expiresAt ? ` Valid until ${fmtDate(expiresAt)}.` : ''} Gift card
        purchases are non-refundable.
      </Text>

      <Text style={s.footnote}>
        Questions? Email <Link href={`mailto:${supportEmail()}`}>{supportEmail()}</Link>.
      </Text>
    </MaplLayout>
  )
}
