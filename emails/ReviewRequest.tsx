import { Heading, Text, Section, Row, Column, Link, Button, Hr } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Post-trip review request, sent one day after the trip finishes.
 *
 * Shape of the email: RECAP FIRST, ASK SECOND. The card at the top reflects
 * the guest's actual trip back at them (where, when, which service) so the ask
 * lands after a beat of "yes, that was my holiday" rather than arriving cold.
 * The recap earns the ask.
 *
 * Two hard constraints are baked into the copy, not bolted on:
 *
 * 1. Tripadvisor prohibits incentivised reviews. Nothing is offered in return,
 *    and the email says so out loud ("there is nothing in it for you"). There
 *    is no deadline, no reminder threat, no second ask.
 *
 * 2. The ask is UNCONDITIONAL. We do not say "if you enjoyed it, review us,
 *    otherwise reply" because that is review gating, which is the same
 *    violation wearing a polite face. Everyone is asked for an honest review,
 *    good or bad, and the private reply route is offered on top of it, never
 *    instead of it.
 *
 * The private route still gets real visual weight (its own card, gold rule,
 * two full sentences) because the listing has zero other reviews: until there
 * is a body of them, a single bad review IS the public rating, so an unhappy
 * guest must have somewhere to put that which is not fine print.
 */

export interface ReviewRequestProps {
  bookingRef: string
  firstName: string | null
  /** Transfer wording vs day-tour wording. */
  isTransfer: boolean
  /** Resort for a transfer, tour or area for a tour. e.g. "Azul Beach Resort Negril". */
  tripLabel: string
  /** Already formatted by the caller. e.g. "15 to 25 August". */
  tripDates: string
  /** The Tripadvisor write-a-review link. */
  reviewUrl: string
  supportEmail: string
}

/* Palette mirrored from _Layout, which keeps these module-private. */
const INK = '#1A1714'
const INK_SOFT = '#57534C'
const BORDER_SOFT = '#F1ECE3'
const GOLD = '#B7873A'
/* Matches the shell exactly: most clients will not load a web font. */
const SANS =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export default function ReviewRequest({
  bookingRef,
  firstName,
  isTransfer,
  tripLabel,
  tripDates,
  reviewUrl,
  supportEmail,
}: ReviewRequestProps) {
  const name = firstName?.trim() || null
  const serviceLabel = isTransfer
    ? 'Private airport transfer'
    : 'Locally led day tour'

  // Reply-to is the intended route, but plenty of clients bury it and some
  // send-domains rewrite it, so the address is always spelled out as a link.
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
    `${bookingRef}: something fell short`,
  )}`

  return (
    <MaplLayout
      preheader={`${tripLabel}, ${tripDates}. Would you write down how it went?`}
    >
      <Text style={s.eyebrow}>Trip complete</Text>

      <Heading as="h1" style={s.hero} className="mapl-h1">
        {name ? `Welcome home, ${name}.` : 'Welcome home.'}
      </Heading>

      <Text style={s.heroLead}>
        {isTransfer
          ? 'The run from Sangster up to the coast. We hope your driver was standing there when you walked out of arrivals, and the road was easy.'
          : 'A day out with somebody who actually lives here. We hope it was worth the early start.'}{' '}
        Here is what we ran for you, and one thing we would like to ask.
      </Text>

      {/* ── The recap. Reflect the trip back before asking for anything. ── */}
      <Section style={s.card} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>Your trip</Text>
        </Section>
        <Section style={s.cardBodyLg} className="mapl-pad">
          <Text style={{ ...s.sectionLabel, fontSize: 12 }}>{serviceLabel}</Text>
          <Text style={tripName}>{tripLabel}</Text>
          <Text style={{ ...s.body, margin: '6px 0 0', color: INK_SOFT }}>
            {tripDates}
          </Text>

          <Hr style={cardRule} />

          <Row>
            <Column valign="top">
              <Text style={{ ...s.rowLabel, fontSize: 13 }}>Booking reference</Text>
            </Column>
            <Column valign="top" align="right">
              <Text style={{ ...s.rowValue, fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>
                {bookingRef}
              </Text>
            </Column>
          </Row>
        </Section>
      </Section>

      {/* ── The ask. Unconditional, uncompensated, once. ── */}
      <Heading as="h2" style={askHeading}>
        Would you write down what happened?
      </Heading>

      <Text style={{ ...s.body, margin: '12px 0 0', fontSize: 15, lineHeight: 1.62, color: INK_SOFT }}>
        We are new on Tripadvisor. Zero reviews, not one. For a small
        Jamaican-run outfit that page is the whole shop window, because people
        read it before they trust a stranger to drive them across the island at
        night.
      </Text>

      <Text style={{ ...s.body, margin: '14px 0 0', fontSize: 15, lineHeight: 1.62, color: INK_SOFT }}>
        So if you have two minutes, say what you found. Good, mixed or bad, we
        want the honest version. There is nothing in it for you, no discount and
        no prize draw, and we would not want you writing a word you do not mean.
      </Text>

      <Section style={s.ctaWrap}>
        <Button href={reviewUrl} style={reviewCta}>
          Write a review on Tripadvisor
        </Button>
      </Section>

      <Text style={{ ...s.bodyMuted, margin: '14px 0 0' }}>
        Stuck for what to say? Whether we turned up on time, who drove you, and
        how the trip actually went is plenty.
      </Text>

      <Text style={{ ...s.bodyMuted, margin: '8px 0 0', wordBreak: 'break-word' }}>
        If the button does not open, use{' '}
        <Link href={reviewUrl} style={inlineLink}>
          {reviewUrl}
        </Link>
      </Text>

      {/* ── The other route. Weighted, not buried. ── */}
      <Section style={fallbackCard} className="mapl-card">
        <Section style={s.cardHeader}>
          <Text style={s.cardHeaderText}>If anything fell short</Text>
        </Section>
        <Section style={s.cardBody} className="mapl-pad">
          <Text style={{ ...s.body, fontSize: 15, lineHeight: 1.62 }}>
            Tell us as well. Reply to this email, or write to{' '}
            <Link href={mailto} style={inlineLink}>
              {supportEmail}
            </Link>
            , and it reaches the people who ran your trip. Not a queue, not a
            form.
          </Text>
          <Text style={{ ...s.body, margin: '12px 0 0', fontSize: 15, lineHeight: 1.62, color: INK_SOFT }}>
            We will answer you ourselves and put right what we can. Write your
            review honestly either way. We would far rather hear the bad thing
            from you than never hear it at all.
          </Text>
        </Section>
      </Section>

      <Text style={{ ...s.body, margin: '26px 0 0' }}>
        Thanks for going with a Jamaican-run outfit. Walk good.
      </Text>
      <Text style={{ ...s.bodyMuted, margin: '4px 0 0' }}>The MAPL Tours team</Text>

      <Text style={s.footnote}>
        You get this once, the day after your trip. We will not chase you
        about it.
      </Text>
    </MaplLayout>
  )
}

/* ───────────────── Local styles ───────────────── */

/** The line that should make them go "yes, that was my holiday". */
const tripName: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: SANS,
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1.25,
  letterSpacing: '-0.015em',
  color: INK,
}

const cardRule: React.CSSProperties = {
  borderColor: BORDER_SOFT,
  margin: '16px 0',
}

const askHeading: React.CSSProperties = {
  margin: '30px 0 0',
  fontFamily: SANS,
  fontSize: 21,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.018em',
  color: INK,
}

/** Primary action. 16px vertical padding keeps the tap target above 48px. */
const reviewCta: React.CSSProperties = {
  ...s.cta,
  padding: '16px 30px',
  fontSize: 15,
  color: '#FFFFFF',
}

/**
 * The private route reads as its own thing: a gold rule down the left edge,
 * the one place in this email that colour is used to say "this matters too".
 */
const fallbackCard: React.CSSProperties = {
  ...s.card,
  margin: '26px 0 0',
  borderLeft: `3px solid ${GOLD}`,
}

/** Links always carry an explicit colour, several clients default to blue. */
const inlineLink: React.CSSProperties = {
  color: INK,
  textDecoration: 'underline',
  fontWeight: 600,
}
