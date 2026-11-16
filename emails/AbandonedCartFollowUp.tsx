import { Button, Heading, Link, Section, Row, Column, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'

/**
 * The cart reminder follow-ups (owner, Nov 15 2026), to a guest who has not
 * booked: step 2, three days after the first reminder, without a code; step
 * 3, seven days after it, with JAMAICA5 (lib/cart-reminders).
 *
 * Their order is the guest's: their trip first (where was I?), on step 3 the
 * code's percentage and the total with it, one button straight under it, then the three worries that stop a booking answered in a line each, then
 * a way to stop. Nothing is held or running out (there is no stock on a
 * private trip), so nothing says it is. The button opens checkout with the
 * trip filled in on any phone or computer when one link can carry it.
 */

export interface FollowUpCoupon {
  code: string
  /**
   * The code's percentage, which is what the email names (owner, Nov 16
   * 2026: "Do not show the discount amount, show the percentage"). The job
   * sends the email only when the code takes exactly this much off this cart,
   * so the figure is never more than the guest gets.
   */
  percent: number
  /** What the guest pays with the code, from the same rules as checkout. */
  totalWithCode: number
}

/** "5%": the percentage as the email prints it. */
export function pct(c: FollowUpCoupon): string {
  return `${Number.isInteger(c.percent) ? c.percent : Number(c.percent.toFixed(2))}%`
}

export interface AbandonedCartFollowUpProps {
  /** 2: three days after the first reminder, no code. 3: seven days after, with the code. */
  step: 2 | 3
  firstName: string | null
  bookingRef: string
  currency: string
  kind: 'tour' | 'transfer'
  items: Array<{ title: string; sub: string; price: number }>
  total: number
  /** Step 3 only; step 2 never shows one, whatever is passed. */
  coupon: FollowUpCoupon | null
  ctaUrl: string
  ctaLabel: string
  /** True when the button rebuilds the trip on any device (a /book link). */
  anyDevice: boolean
  /** The tour's name when the cart is one tour, for the headline. */
  tourTitle?: string | null
  /** A ride that meets a flight at Sangster (round trip, or one way from the airport). */
  arrives?: boolean
  stopUrl: string
}

const GOLD_INK = '#7A5A08'

export function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${currency === 'USD' ? '$' : `${currency} `}${abs}`
}

/** What the cart is, in a few words: "airport ride", "Bamboo Rafting on the Martha Brae", "Jamaica trip". */
export function cartWhat(kind: 'tour' | 'transfer', tourTitle?: string | null): string {
  if (kind === 'transfer') return 'airport ride'
  return tourTitle?.trim() || 'Jamaica trip'
}

/** The code, only on the step that carries one. */
function codeOf(p: Pick<AbandonedCartFollowUpProps, 'step' | 'coupon'>): FollowUpCoupon | null {
  return p.step === 3 ? p.coupon : null
}

export function followUpSubject(p: Pick<AbandonedCartFollowUpProps, 'step' | 'kind' | 'tourTitle' | 'coupon' | 'currency'>): string {
  const what = cartWhat(p.kind, p.tourTitle)
  const yours = p.kind === 'transfer' || !p.tourTitle ? `your ${what}` : what
  const code = codeOf(p)
  if (code) return `${pct(code)} off ${yours}`
  return p.kind === 'transfer' || !p.tourTitle ? `Your ${what} is still saved` : `${what} is still saved`
}

export function followUpPreheader(p: Pick<AbandonedCartFollowUpProps, 'step' | 'kind' | 'tourTitle' | 'coupon' | 'currency' | 'anyDevice'>): string {
  const what = cartWhat(p.kind, p.tourTitle)
  const saved = p.kind === 'transfer' || !p.tourTitle ? `Your ${what} is saved` : `${what} is saved`
  const where = p.anyDevice ? ', ready to finish on any phone or computer.' : ', ready to finish whenever you are.'
  const code = codeOf(p)
  return code ? `${code.code} takes ${pct(code)} off. ${saved}${where}` : `${saved}${where}`
}

export default function AbandonedCartFollowUp(props: AbandonedCartFollowUpProps) {
  const { step, firstName, bookingRef, currency, kind, items, total, ctaUrl, ctaLabel, anyDevice, tourTitle, arrives = true, stopUrl } = props
  const coupon = codeOf(props)
  const name = firstName?.trim() || null
  const isRide = kind === 'transfer'

  // Step 3 leads with the thank-you; step 2 with the trip itself.
  const headline = coupon
    ? `Here's ${pct(coupon)} off your ${isRide ? 'ride' : tourTitle ? 'tour' : 'trip'}${name ? `, ${name}` : ''}.`
    : isRide
    ? arrives
      ? "Land, spot your name, and you're on your way."
      : 'Your ride to the airport is still saved.'
    : name
      ? `Ready when you are, ${name}.`
      : 'Ready when you are.'

  // The name goes once: in the headline when it carries it (the code, or
  // "Ready when you are"), else at the start of this line.
  const greet = name && isRide && !coupon ? `${name}, your` : 'Your'
  // The ride's headline is the moment itself; a tour's names the tour here.
  const saved = isRide
    ? `${greet} private airport ride is saved.`
    : tourTitle
      ? `${tourTitle} is saved with your date and party.`
      : 'Your tours are saved.'
  const how = anyDevice
    ? `The button opens checkout with ${isRide ? 'your ride and flights' : 'it all'} already filled in, on any phone or computer.`
    : `On the phone or computer you started on, checkout still has ${isRide || tourTitle ? 'it' : 'them'} as you left ${isRide || tourTitle ? 'it' : 'them'}.`
  const lead = `${saved} ${how}`

  const worries = isRide
    ? [
        arrives
          ? ['Flight running late?', 'Your driver tracks it and meets you at arrivals with a name sign.']
          : ['Pickup timed to your flight.', 'We work it out from when your flight leaves, and you can adjust it at checkout.'],
        ['One price for the car.', 'A private car for your party, the same fare for 1 to 4 people.'],
        ['Plans can change.', CANCELLATION_SUMMARY.lead],
      ]
    : [
        ['Pickup is included.', 'Private transport from your hotel and back is in the price.'],
        ['Local all the way.', 'Jamaican drivers and hosts who know the island.'],
        ['Plans can change.', CANCELLATION_SUMMARY.lead],
      ]

  return (
    <MaplLayout title={headline} preheader={followUpPreheader(props)}>
      <Text style={s.eyebrow}>{coupon ? 'A little thank-you' : 'Still saved for you'}</Text>
      <Heading as="h1" style={{ ...s.hero, overflowWrap: 'anywhere', wordBreak: 'break-word' }} className="mapl-h1">
        {headline}
      </Heading>
      <Text style={s.heroLead} className="mapl-body">
        {lead} Nothing is charged until you pay.
      </Text>

      {/* The trip, then the code's percentage and the total with it. */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>
            Your trip · {items.length} item{items.length !== 1 ? 's' : ''}
          </Text>
        </Section>
        {items.map((item, i) => (
          <Section key={i} style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
            <Row>
              <Column style={{ verticalAlign: 'top', paddingRight: 12 }} className="mapl-stack-col">
                <Text style={{ ...s.body, fontWeight: 600, marginBottom: 4 }}>{item.title}</Text>
                {item.sub ? <Text style={s.bodyMuted}>{item.sub}</Text> : null}
              </Column>
              {/* One item without a code: the total below is its price, so it is
                  not said twice. With a code it stays, as the figure the saving
                  is taken from. */}
              {items.length > 1 || coupon ? (
                <Column style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }} className="mapl-stack-col">
                  <Text style={{ ...s.rowValue, fontWeight: 600 }}>{fmtMoney(item.price, currency)}</Text>
                </Column>
              ) : null}
            </Row>
          </Section>
        ))}
        <Section style={{ ...s.cardBody, paddingTop: 0 }}>
          {coupon ? (
            <Row style={{ ...s.totalTableRow }}>
              <Column style={{ verticalAlign: 'baseline' }}>
                <Text style={{ ...s.rowLabel, color: GOLD_INK, fontWeight: 700 }}>
                  Code {coupon.code}
                </Text>
              </Column>
              <Column style={{ verticalAlign: 'baseline', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Text style={{ ...s.rowValue, color: GOLD_INK, fontWeight: 700 }}>
                  {`${pct(coupon)} off`}
                </Text>
              </Column>
            </Row>
          ) : null}
          <Row style={coupon ? { paddingTop: 10 } : s.totalTableRow}>
            <Column style={{ verticalAlign: 'baseline' }}>
              <Text style={s.totalLabel}>{coupon ? 'Your total with the code' : 'Your total'}</Text>
            </Column>
            <Column style={{ verticalAlign: 'baseline', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <Text style={s.totalValue}>{fmtMoney(coupon ? coupon.totalWithCode : total, currency)}</Text>
            </Column>
          </Row>
        </Section>
      </Section>

      <Section style={{ ...s.ctaWrap, margin: '22px 0 0' }}>
        <Button href={ctaUrl} className="mapl-cta-block" style={s.cta}>
          {ctaLabel}
        </Button>
      </Section>
      {coupon ? (
        <Text style={{ ...s.bodyMuted, margin: '12px 0 0', fontSize: 14, lineHeight: 1.55 }} className="mapl-note">
          At checkout, type <strong style={{ color: GOLD_INK, letterSpacing: '0.04em' }}>{coupon.code}</strong> in the code box.
          One use per guest, and it comes out of our share, never {isRide ? "your driver's pay" : "your hosts' pay"}.
        </Text>
      ) : null}

      {/* The three things that stop a booking, answered in a line each. */}
      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Good to know</Text>
        </Section>
        <Section style={s.cardBody}>
          {worries.map(([lead, rest], i) => (
            <Text key={i} style={{ ...s.body, margin: i === 0 ? 0 : '10px 0 0', fontSize: 15, lineHeight: 1.55 }} className="mapl-body">
              <strong>{lead}</strong> {rest}
            </Text>
          ))}
          <Text style={s.note} className="mapl-note">
            Questions first? Reply to this email and one of us will write back within 24 hours. Reference {bookingRef}. No problem.
          </Text>
        </Section>
      </Section>

      <Text style={s.footnote} className="mapl-note">
        {step === 3 ? 'This is our last note about this trip. Not for you?' : 'Not planning this trip any more?'}{' '}
        <Link href={stopUrl} style={{ color: 'inherit', textDecoration: 'underline' }}>
          Stop these reminders
        </Link>
        .
      </Text>
    </MaplLayout>
  )
}
