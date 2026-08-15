import { Heading, Text, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to the DRIVER when the operator checks a pay step in the dispatch
 * console. It is a payment notice, not a receipt: it says MAPL has sent the
 * money and exactly which trip and leg it covers, so the driver's records and
 * MAPL's always agree. Ops is BCCed, so three inboxes hold the same paper
 * trail (operator, driver, ops).
 *
 * Money figures come from moneyBlock, the same source the dispatch console
 * shows the operator, so the email can never disagree with the console.
 */

export interface DriverPaidProps {
  driverName: string
  bookingRef: string
  guestName: string
  /** 'first' | 'second' for round trips, 'full' for one-ways. */
  half: 'first' | 'second' | 'full'
  /** USD amount of THIS payment. */
  amount: string
  /** USD total the driver receives for the whole booking. */
  totalForTrip: string
  /** e.g. "MBJ Airport → Azul Beach Resort Negril" */
  tripLabel: string
  /** Pretty Jamaica-time string for the leg this payment covers. */
  whenLabel: string
  passengers: number
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ padding: '9px 0', borderBottom: '1px solid #f0f0f0' }}>
      <Text style={{ ...s.sectionLabel, margin: 0 }}>{label}</Text>
      <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

export default function DriverPaid(props: DriverPaidProps) {
  const { driverName, bookingRef, guestName, half, amount, totalForTrip, tripLabel, whenLabel, passengers } = props
  const halfLabel = half === 'full' ? 'Payment in full' : half === 'first' ? 'First half' : 'Second half'

  return (
    <MaplLayout preheader={`${amount} sent · ${halfLabel} · ${bookingRef}`}>
      <Text style={s.eyebrow}>Driver payment · {halfLabel}</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {amount} on the way, {driverName}.
      </Heading>
      <Text style={s.heroLead}>
        MAPL has sent your payment for the trip below. Depending on the bank it
        can take a little while to show in your account. This notice is your
        record of what was paid and what it covers.
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>This payment</Text>
        </Section>
        <Section style={s.cardBody}>
          <Row label="Amount sent" value={`${amount} USD`} />
          <Row label="Covers" value={halfLabel === 'Payment in full' ? 'The whole trip' : `${halfLabel} of ${totalForTrip} USD total`} />
          <Row label="Guest" value={guestName} />
          <Row label="Trip" value={tripLabel} />
          <Row label="Pickup" value={`${whenLabel} Jamaica time`} />
          <Section style={{ padding: '9px 0' }}>
            <Text style={{ ...s.sectionLabel, margin: 0 }}>Passengers</Text>
            <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{passengers}</Text>
          </Section>
        </Section>
      </Section>

      {half === 'first' && (
        <Text style={s.note}>
          The second half follows before the departure pickup, as always.
        </Text>
      )}
      <Text style={s.note}>
        Anything off about this payment, reply to this email and we will sort
        it out. Respect, {driverName}.
      </Text>
    </MaplLayout>
  )
}
