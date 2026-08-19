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
  totalPaid: number
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
    totalPaid,
    currency,
    paidAt,
    specialRequests,
    transfers,
  } = props
  const name = firstName?.trim() || 'there'
  // Transfers are quoted and sold at ONE all-in price. `subtotal` is the
  // driver's wholesale cost and `bookingFee` is MAPL's margin, so itemising
  // them here would publish internal costs to the customer. Show the total.
  const showBreakdown = false
  void subtotal
  void bookingFee
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
        driver will be waiting in the arrivals area with a MAPL Tours sign.
        Booking reference{' '}
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
          {showBreakdown && (
            <>
              {subtotal != null && (
                <BreakdownLine label="Subtotal" value={fmtMoney(subtotal, currency)} />
              )}
              {bookingFee != null && (
                <BreakdownLine label="Service fee" value={fmtMoney(bookingFee, currency)} />
              )}
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

function BreakdownLine({ label, value }: { label: string; value: string }) {
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
      <Text style={s.rowValue}>{value}</Text>
    </div>
  )
}
