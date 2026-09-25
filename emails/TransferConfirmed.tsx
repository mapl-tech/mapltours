import { Heading, Text, Link, Section, Row, Column } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface TransferConfirmedProps {
  bookingRef: string
  firstName: string | null
  lastName?: string | null
  email?: string | null
  customerPhone: string | null
  country?: string | null
  /** Per-leg breakdown, server fills these when we have them. */
  subtotal?: number | null
  bookingFee?: number | null
  /** A code applied at checkout; the total is already net of it. */
  couponCode?: string | null
  couponDiscount?: number | null
  totalPaid: number
  /** Portion of totalPaid that came off a gift card. Absent or 0 means none. */
  giftApplied?: number | null
  /**
   * What the card was actually charged. Omitted, it is totalPaid minus
   * giftApplied, which holds whenever a PaymentIntent took the rest. Pass 0
   * when the booking has none: checkout absorbs a gift-card remainder under
   * Stripe's 50-cent minimum and marks the booking paid with no card charge.
   */
  cardCharged?: number | null
  currency: string
  paidAt?: string | null
  specialRequests?: string | null
  transfers: Array<{
    destination: string
    zone: string
    tripType: 'one_way' | 'round_trip'
    passengers: number
    priceUsd: number
    arrivalFlight: string | null
    arrivalAt: string | null
    departureFlight: string | null
    departureAt: string | null
  }>
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${currency === 'USD' ? '$' : `${currency} `}${abs}`
}

function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    // Flight times are the customer's Jamaica wall-clock; read in UTC so they
    // never shift to the mail client's or server's local timezone.
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  } catch {
    return null
  }
}

export default function TransferConfirmed(props: TransferConfirmedProps) {
  const {
    bookingRef,
    firstName,
    email,
    customerPhone,
    country,
    subtotal,
    bookingFee,
    couponCode,
    couponDiscount,
    totalPaid,
    giftApplied,
    cardCharged,
    currency,
    paidAt,
    specialRequests,
    transfers,
  } = props
  const name = firstName?.trim() || 'there'
  // Transfers are quoted and sold at ONE all-in price. `subtotal` is the
  // driver's wholesale cost and `bookingFee` is MAPL's margin, so they are
  // never itemised here: that would publish internal costs to the guest.
  // The only line above the total is a code the guest applied, shown
  // against the fare they were quoted.
  void subtotal
  void bookingFee
  const hasCoupon = couponDiscount != null && couponDiscount > 0
  const { giftPaid, cardPaid, coveredByUs } = paymentSplit(totalPaid, giftApplied, cardCharged)
  const paidAtPretty = fmtDateTime(paidAt)
  const customerLines = [
    [firstName, props.lastName].filter(Boolean).join(' ').trim() || null,
    email ?? null,
    customerPhone ?? null,
    country ?? null,
  ].filter(Boolean) as string[]

  return (
    <MaplLayout preheader={`Transfer confirmed · ${bookingRef} · Jamaica airport ride details`}>
      <Text style={s.eyebrow}>✓ Transfer confirmed</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        Thank you, {name}.
      </Heading>
      <Text style={s.heroLead}>
        Your transfer{transfers.length > 1 ? 's are' : ' is'} confirmed. Your
        driver will be waiting in the arrivals area with a MAPL Tours Jamaica
        sign. Booking reference{' '}
        <strong style={{ color: '#1a1a1a' }}>{bookingRef}</strong>.
      </Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{bookingRef}</span>
      </Section>
      <Section style={s.ctaWrap}>
        <Link href={`${siteUrl()}/explore`} style={s.cta}>
          Add tours to your trip
        </Link>
      </Section>

      {/* Itinerary card, per-leg flight info */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            Itinerary · {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
          </Text>
        </Section>
        {transfers.map((t, i) => (
          <Section
            key={i}
            style={{
              padding: '16px 18px',
              borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
            }}
          >
            <Row>
              <Column style={{ verticalAlign: 'top', paddingRight: 12 }} className="mapl-stack-col">
                <Text style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>
                  {t.destination}
                </Text>
                <Text style={s.bodyMuted}>
                  Zone {t.zone} ·{' '}
                  {t.tripType === 'round_trip' ? 'Round-trip' : 'One-way'} ·{' '}
                  {t.passengers} passenger{t.passengers !== 1 ? 's' : ''}
                </Text>
              </Column>
              <Column style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }} className="mapl-stack-col">
                <Text style={{ ...s.rowValue, fontWeight: 600 }}>
                  {fmtMoney(t.priceUsd, currency)}
                </Text>
              </Column>
            </Row>

            {t.arrivalAt && (
              <Section style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid #e7e7e7' }}>
                <Text style={s.sectionLabel}>Arrival · MBJ → hotel</Text>
                <Text style={{ ...s.body, marginTop: 2 }}>
                  {fmtDateTime(t.arrivalAt)} Jamaica time
                  {t.arrivalFlight ? ` · flight ${t.arrivalFlight}` : ''}
                </Text>
              </Section>
            )}

            {/* Gated on the timestamp alone, exactly like the arrival block above.
                Requiring round_trip meant a ONE-WAY hotel-to-airport transfer
                rendered neither leg: the guest was told what they had paid and
                where they were going, with no date, no time and no flight
                anywhere in the email, and the operator alert dropped it too. */}
            {t.departureAt && (
              <Section style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #e7e7e7' }}>
                <Text style={s.sectionLabel}>Departure · hotel → MBJ</Text>
                <Text style={{ ...s.body, marginTop: 2 }}>
                  Hotel pickup {fmtDateTime(t.departureAt)} Jamaica time
                  {t.departureFlight ? ` · flight ${t.departureFlight}` : ''}
                </Text>
              </Section>
            )}
          </Section>
        ))}
      </Section>

      {/* Order summary */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Payment summary</Text>
        </Section>
        <Section style={s.cardBody}>
          {hasCoupon && (
            <>
              <BreakdownLine label="Fare" value={fmtMoney(totalPaid + couponDiscount, currency)} />
              <BreakdownLine label={couponCode ? `Code ${couponCode}` : 'Discount code'} value={`− ${fmtMoney(couponDiscount, currency)}`} emphasis="emerald" />
            </>
          )}
          <div style={s.totalRow}>
            <Text style={s.totalLabel}>
              Total paid
              {paidAtPretty && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: 400,
                    color: '#9a9a9a',
                    letterSpacing: 0,
                  }}
                >
                  {paidAtPretty}
                </span>
              )}
            </Text>
            <Text style={s.totalValue}>{fmtMoney(totalPaid, currency)}</Text>
          </div>
          {/* A gift-funded booking's card was charged LESS than the total,
              and the guest will check this email against their own card
              statement. So say how the total was paid, UNDER it: two parts
              of the total, not deductions from it, so no minus sign. No card
              line when the card was not charged. A sub-minimum remainder checkout absorbed gets
              its own line, so the parts add up to the total. */}
          {giftPaid > 0 && (
            <div style={{ marginTop: 12 }}>
              <BreakdownLine label="Paid with gift card" value={fmtMoney(giftPaid, currency)} />
              {cardPaid > 0 && <BreakdownLine label="Paid by card" value={fmtMoney(cardPaid, currency)} />}
              {coveredByUs > 0 && <BreakdownLine label="Covered by MAPL Tours Jamaica" value={fmtMoney(coveredByUs, currency)} />}
            </div>
          )}
        </Section>
      </Section>

      {/* Customer */}
      {customerLines.length > 0 && (
        <Section style={s.card}>
          <Section style={s.cardHeader}>
            <Text style={s.cardHeaderText}>Your details</Text>
          </Section>
          <Section style={s.cardBody}>
            {customerLines.map((line, i) => (
              <Text key={i} style={s.body}>
                {line}
              </Text>
            ))}
          </Section>
        </Section>
      )}

      {/* Special requests */}
      {specialRequests && (
        <Section style={s.card}>
          <Section style={s.highlightCardHeader}>
            <Text style={s.highlightCardHeaderText}>Special requests</Text>
          </Section>
          <Section style={s.cardBody}>
            <Text style={{ ...s.body, whiteSpace: 'pre-wrap' }}>
              {specialRequests}
            </Text>
          </Section>
        </Section>
      )}

      {/* On arrival */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>On arrival at MBJ</Text>
        </Section>
        <Section style={s.cardBody}>
          <Text style={s.body}>· Clear immigration and collect your bags.</Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Exit the terminal at arrivals. Your driver will be waiting at the
            MAPL Tours sign.
          </Text>
          <Text style={{ ...s.body, marginTop: 6 }}>
            · Reach us any time at{' '}
            <Link href="mailto:contact@mapltours.com" style={{ color: '#1a1a1a', textDecoration: 'underline' }}>
              contact@mapltours.com
            </Link>
          </Text>
          <Text style={s.note}>
            Flexible cancellation within 48 hours of booking. Request it from
            your Profile page, or reply to this email, and we will review it.
            Refunds are less an administration charge equivalent to 20% of the
            total amount of fees paid plus taxes (if applicable). Safe travels.
          </Text>
        </Section>
      </Section>
    </MaplLayout>
  )
}

/**
 * The gift / card split of totalPaid. Every part is 0 unless a gift card
 * paid something. The card part is `cardCharged` when the caller knows it,
 * otherwise what the gift left over, rounded to the cent.
 *
 * `coveredByUs` is the gap checkout absorbs: a gift card that leaves less
 * than Stripe's 50-cent minimum settles the booking with no card charge, so
 * gift and card alone fall up to 49 cents short of the total, and without a
 * line of its own the parts would not add up. Only that sub-minimum gap is
 * shown; any larger gap is not something checkout produces, and the email
 * does not guess at it.
 */
function paymentSplit(
  totalPaid: number,
  giftApplied: number | null | undefined,
  cardCharged: number | null | undefined,
): { giftPaid: number; cardPaid: number; coveredByUs: number } {
  const giftPaid = giftApplied != null && giftApplied > 0 ? giftApplied : 0
  if (giftPaid === 0) return { giftPaid: 0, cardPaid: 0, coveredByUs: 0 }
  const card = cardCharged ?? totalPaid - giftPaid
  const cardPaid = Math.max(0, Math.round(card * 100) / 100)
  const gapCents = Math.round((totalPaid - giftPaid - cardPaid) * 100)
  return { giftPaid, cardPaid, coveredByUs: gapCents > 0 && gapCents < 50 ? gapCents / 100 : 0 }
}

function BreakdownLine({ label, value, emphasis }: { label: string; value: string; emphasis?: 'emerald' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        margin: '0 0 8px',
      }}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={emphasis === 'emerald' ? { ...s.rowValue, color: '#1d7a50', fontWeight: 600 } : s.rowValue}>{value}</Text>
    </div>
  )
}
