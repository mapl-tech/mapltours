import { Heading, Text, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to the tour operator when the Wise payout job has paid a tour booking
 * (lib/email/driver-paid.ts notifyTourPaid). The tour counterpart of
 * DriverPaid: a payment notice, not a receipt, saying what was sent and
 * exactly which tours and days it covers, so the operator's records and
 * MAPL's agree. Ops is BCCed.
 *
 * The amount is the booking's subtotal, what the tour checkout stores as owed
 * to the operator (priced from the rate card at booking time): the same
 * figure the payout job paid.
 */

export interface TourPaidProps {
  payeeName: string
  bookingRef: string
  guestName: string
  /** USD amount of this payment, as the console writes money: "$300.00". */
  amount: string
  tours: { title: string; dayLabel: string; guests: number }[]
  pickup: string | null
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <Section style={{ padding: '9px 0', ...(last ? {} : { borderBottom: '1px solid #f0f0f0' }) }}>
      <Text style={{ ...s.sectionLabel, margin: 0 }}>{label}</Text>
      <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

export default function TourPaid(props: TourPaidProps) {
  const { payeeName, bookingRef, guestName, amount, tours, pickup } = props
  const rows: { label: string; value: string }[] = [
    { label: 'Amount sent', value: `${amount} USD` },
    { label: 'Covers', value: tours.length > 1 ? `All ${tours.length} tours on this booking` : 'The whole tour booking' },
    { label: 'Guest', value: guestName },
    ...tours.map((t) => ({ label: t.title, value: `${t.dayLabel}, ${t.guests} ${t.guests === 1 ? 'guest' : 'guests'}` })),
    ...(pickup ? [{ label: 'Pickup', value: pickup }] : []),
  ]

  return (
    <MaplLayout preheader={`${amount} sent · Tour · ${bookingRef}`}>
      <Text style={s.eyebrow}>Tour payment</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {amount} on the way, {payeeName}.
      </Heading>
      <Text style={s.heroLead}>
        We have sent your payment for the {tours.length > 1 ? 'tours' : 'tour'} below.
        Depending on the bank it can take a little while to show in your
        account. This notice is your record of what was paid and what it covers.
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>This payment</Text>
        </Section>
        <Section style={s.cardBody}>
          {rows.map((r, i) => (
            <Row key={`${r.label}-${i}`} label={r.label} value={r.value} last={i === rows.length - 1} />
          ))}
        </Section>
      </Section>

      <Text style={s.note}>
        Anything off about this payment, reply to this email and we will sort
        it out. Respect, {payeeName}.
      </Text>
    </MaplLayout>
  )
}
