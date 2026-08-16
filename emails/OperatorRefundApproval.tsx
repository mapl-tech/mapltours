import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface OperatorRefundApprovalProps {
  bookingRef: string
  bookingId: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  totalPaid: number
  refundAmount: number
  adminCharge: number
  currency: string
  isTransfer?: boolean
  /** When the earliest experience or pickup runs, ISO. */
  serviceStartsAt?: string | null
  items: Array<{ title: string; destination: string; date: string; travelers: number }>
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${Math.abs(n).toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return iso }
}

/**
 * Ops alert: a cancellation is waiting on a decision.
 *
 * Leads with the action and the deadline pressure, because an unapproved
 * request is a traveler waiting on their money and a driver still holding a
 * slot. The money is secondary detail.
 */
export default function OperatorRefundApproval({
  bookingRef, bookingId, customerName, customerEmail, customerPhone,
  totalPaid, refundAmount, adminCharge, currency, isTransfer = false,
  serviceStartsAt, items,
}: OperatorRefundApprovalProps) {
  return (
    <MaplLayout
      preheader={`Approval needed · ${bookingRef} · ${fmtMoney(refundAmount, currency)} refund requested`}
    >
      <Text style={{ ...s.eyebrow, color: '#B42318' }}>Approval needed</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        Refund request
      </Heading>
      <Text style={s.heroLead}>
        {customerName} asked to cancel {bookingRef}. Nothing has been refunded
        and the {isTransfer ? 'transfer' : 'trip'} is still live &mdash; approve or decline it in
        the admin dashboard.
        {serviceStartsAt ? ` It runs ${fmtDate(serviceStartsAt)}.` : ''}
      </Text>

      <Section style={s.ctaWrap}>
        <Link href={`${siteUrl()}/admin/refunds`} style={s.cta}>
          Review this request
        </Link>
      </Section>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Requested refund</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Paid</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{fmtMoney(totalPaid, currency)}</Text></Column>
          </Row>
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Administration charge retained</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{fmtMoney(adminCharge, currency)}</Text></Column>
          </Row>
          <Row style={s.totalRow}>
            <Column><Text style={s.totalLabel}>Would refund</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(refundAmount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      {items.length > 0 && (
        <Section style={s.card} className="mapl-card">
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Booking</Text>
          </Section>
          <Section style={s.cardBody} className="mapl-pad">
            {items.map((item, i) => (
              <Text key={i} style={{ ...s.body, margin: i === 0 ? 0 : '10px 0 0' }}>
                {item.title}
                <br />
                <span style={{ color: '#6E6A62', fontSize: 13.5 }}>
                  {item.destination}
                  {item.date ? ` · ${fmtDate(item.date)}` : ''}
                  {item.travelers ? ` · ${item.travelers} pax` : ''}
                </span>
              </Text>
            ))}
          </Section>
        </Section>
      )}

      <Text style={s.note}>
        {customerEmail ?? 'no email on record'}
        {customerPhone ? ` · ${customerPhone}` : ''} · booking {bookingId}
      </Text>
    </MaplLayout>
  )
}
