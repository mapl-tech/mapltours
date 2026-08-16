import { Heading, Text, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface OperatorCancellationAlertProps {
  bookingRef: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  totalPaid: number
  refundAmount: number
  adminCharge: number
  currency: string
  isTransfer?: boolean
  /** Set when the refund came from the Stripe Dashboard rather than the app. */
  source?: 'self-serve' | 'dashboard'
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
  }>
}

function fmtMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${Math.abs(n).toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Internal alert: a trip is OFF.
 *
 * The operational point is the dates, not the money — a driver or creator is
 * still holding these slots and has to be stood down. Dates lead; the refund
 * figures follow for reconciliation.
 */
export default function OperatorCancellationAlert({
  bookingRef,
  customerName,
  customerEmail,
  customerPhone,
  totalPaid,
  refundAmount,
  adminCharge,
  currency,
  isTransfer = false,
  source = 'self-serve',
  items,
}: OperatorCancellationAlertProps) {
  const dates = items.map((i) => i.date).filter(Boolean).sort()

  return (
    <MaplLayout
      preheader={`CANCELLED · ${bookingRef} · ${fmtMoney(refundAmount, currency)} refunded · stand down ${dates.length || 'the'} date${dates.length === 1 ? '' : 's'}`}
    >
      <Text style={{ ...s.eyebrow, color: '#B42318' }}>Cancelled &middot; action required</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        {isTransfer ? 'Transfer' : 'Booking'} cancelled
      </Heading>
      <Text style={s.heroLead}>
        {bookingRef} has been cancelled and refunded
        {source === 'dashboard' ? ' from the Stripe Dashboard' : ' by the traveler'}.
        Release the {isTransfer ? 'driver and vehicle' : 'creator and any held slots'} for
        the date{dates.length === 1 ? '' : 's'} below.
      </Text>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Stand down</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          {items.length === 0 && <Text style={s.bodyMuted}>No line items on this booking.</Text>}
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

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Traveler</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Text style={s.body}>{customerName}</Text>
          <Text style={{ ...s.bodyMuted, margin: '4px 0 0' }}>
            {customerEmail ?? 'no email on record'}
            {customerPhone ? ` · ${customerPhone}` : ''}
          </Text>
        </Section>
      </Section>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Money</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Originally paid</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{fmtMoney(totalPaid, currency)}</Text></Column>
          </Row>
          <Row style={s.rowFlex}>
            <Column><Text style={s.rowLabel}>Administration charge retained</Text></Column>
            <Column align="right"><Text style={s.rowValue}>{fmtMoney(adminCharge, currency)}</Text></Column>
          </Row>
          <Row style={s.totalRow}>
            <Column><Text style={s.totalLabel}>Refunded to traveler</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(refundAmount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      <Text style={s.note}>
        Stripe keeps its original processing fee on refunds, so the retained
        administration charge is not all margin. Reference {bookingRef}.
      </Text>
    </MaplLayout>
  )
}
