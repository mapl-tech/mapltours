import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl, supportEmail } from './_Layout'

export interface BookingCancelledProps {
  bookingRef: string
  firstName: string | null
  /** What the traveler originally paid. */
  totalPaid: number
  /** Cash returned through Stripe. Null on older rows with no stored split. */
  cashRefund?: number | null
  /** Store credit returned to a gift card. Null when none was used. */
  giftRefund?: number | null
  /**
   * The gift-card credit did not land when the refund was approved, and
   * operations is adding it by hand. The receipt then says the credit is on
   * its way, never that it is available now.
   */
  giftCreditPending?: boolean
  /** What we are sending back. */
  refundAmount: number
  /** What we retained, per the published 20% administration charge. */
  adminCharge: number
  currency: string
  isTransfer?: boolean
  items: Array<{
    title: string
    destination: string
    date: string
    travelers: number
  }>
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '-'
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
 * Traveler cancellation receipt.
 *
 * Deliberately a RECEIPT, not an apology: the one thing someone wants after
 * cancelling is written proof of what they are getting back and when. The
 * administration charge is shown as its own line rather than folded into a
 * net figure, so the deduction can never look like a silent shortfall.
 */
export default function BookingCancelled({
  bookingRef,
  firstName,
  totalPaid,
  refundAmount,
  adminCharge,
  cashRefund,
  giftRefund,
  giftCreditPending = false,
  currency,
  isTransfer = false,
  items,
}: BookingCancelledProps) {
  const noun = isTransfer ? 'transfer' : 'booking'

  // A refund paid partly or wholly in store credit must say so. Quoting one
  // number and calling it "back to your card" is what produces "my bank never
  // got it" support tickets, and chargebacks, on every gift-funded
  // cancellation. Three cases, never mixed up: both halves (a split), gift
  // credit only (a gift-covered booking with no card charge refunds entirely
  // as credit), or card only, which is also every older row with no stored
  // split. A split needs BOTH halves above zero, or it prints "$0.00 back to
  // the card you paid with".
  const cashPart = Number(cashRefund ?? 0)
  const giftPart = Number(giftRefund ?? 0)
  const hasSplit = cashPart > 0 && giftPart > 0
  const giftOnly = giftPart > 0 && !(cashPart > 0)
  // Only meaningful when there is gift credit to add.
  const giftPending = giftCreditPending && giftPart > 0
  const who = firstName ? `${firstName}, we` : 'We'

  return (
    <MaplLayout
      preheader={`${bookingRef} cancelled · ${fmtMoney(refundAmount, currency)} refunded`}
    >
      <Text style={{ ...s.eyebrow, color: '#6E6A62' }}>Booking cancelled</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        Your {noun} is cancelled
      </Heading>
      <Text style={s.heroLead}>
        {hasSplit && giftPending ? (
          <>
            {who}&rsquo;ve cancelled {bookingRef} and sent{' '}
            {fmtMoney(cashPart, currency)} back to the card you paid with. We are
            also adding {fmtMoney(giftPart, currency)} back onto your gift card:
            our team is putting that credit on by hand, so it is not there yet.
            Card refunds usually appear within 5&ndash;10 business days,
            depending on your bank.
          </>
        ) : hasSplit ? (
          <>
            {who}&rsquo;ve cancelled {bookingRef} and sent{' '}
            {fmtMoney(cashPart, currency)} back to the card you paid with and{' '}
            {fmtMoney(giftPart, currency)} back onto your gift card. Card refunds
            usually appear within 5&ndash;10 business days, depending on your
            bank; gift-card credit is available straight away.
          </>
        ) : giftOnly && giftPending ? (
          <>
            {who}&rsquo;ve cancelled {bookingRef} and are adding{' '}
            {fmtMoney(giftPart, currency)} back onto your gift card. Our team is
            putting the credit on by hand, so it is not there yet.
          </>
        ) : giftOnly ? (
          <>
            {who}&rsquo;ve cancelled {bookingRef} and put{' '}
            {fmtMoney(giftPart, currency)} back onto your gift card. The credit
            is available straight away.
          </>
        ) : (
          <>
            {who}&rsquo;ve cancelled {bookingRef} and sent{' '}
            {fmtMoney(refundAmount, currency)} back to the card you paid with.
            Card refunds usually appear within 5&ndash;10 business days,
            depending on your bank.
          </>
        )}
      </Text>

      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Refund summary</Text>
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
          {hasSplit ? (
            <>
              <Row style={s.rowFlex}>
                <Column><Text style={s.rowLabel}>Back to your card</Text></Column>
                <Column align="right"><Text style={s.rowValue}>{fmtMoney(cashPart, currency)}</Text></Column>
              </Row>
              <Row style={s.rowFlex}>
                <Column><Text style={s.rowLabel}>{giftPending ? 'Being added to your gift card' : 'Back to your gift card'}</Text></Column>
                <Column align="right"><Text style={s.rowValue}>{fmtMoney(giftPart, currency)}</Text></Column>
              </Row>
            </>
          ) : null}
          <Row style={s.totalRow}>
            <Column><Text style={s.totalLabel}>{hasSplit ? 'Total refunded' : giftOnly ? (giftPending ? 'Being added to your gift card' : 'Refunded to your gift card') : 'Refunded to your card'}</Text></Column>
            <Column align="right"><Text style={s.totalValue}>{fmtMoney(refundAmount, currency)}</Text></Column>
          </Row>
        </Section>
      </Section>

      {items.length > 0 && (
        <Section style={s.card} className="mapl-card">
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>
              What was cancelled
            </Text>
          </Section>
          <Section style={s.cardBody} className="mapl-pad">
            {items.map((item, i) => (
              <Text
                key={i}
                style={{ ...s.body, margin: i === 0 ? 0 : '10px 0 0' }}
              >
                {item.title}
                <br />
                <span style={{ color: '#6E6A62', fontSize: 13.5 }}>
                  {item.destination}
                  {item.date ? ` · ${fmtDate(item.date)}` : ''}
                  {item.travelers ? ` · ${item.travelers} ${item.travelers === 1 ? 'guest' : 'guests'}` : ''}
                </span>
              </Text>
            ))}
          </Section>
        </Section>
      )}

      {/* The card wording (10 business days) belongs to a card refund only:
          gift credit does not travel through a bank. */}
      <Text style={s.note}>
        Booking reference {bookingRef}. Keep this email as your record of the
        refund.{' '}
        {giftOnly
          ? 'If the amount looks wrong, or the credit is not on your gift card, reply to this email and we will chase it with you.'
          : 'If the amount looks wrong, or the refund has not arrived after 10 business days, reply to this email and we will chase it with you.'}
      </Text>

      <Section style={s.ctaWrap}>
        <Link href={`${siteUrl()}/explore`} style={s.cta}>
          Browse experiences
        </Link>
      </Section>

      <Text style={s.footnote}>
        Questions? Email <Link href={`mailto:${supportEmail()}`}>{supportEmail()}</Link>.
      </Text>
    </MaplLayout>
  )
}
