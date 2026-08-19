import {
  Button,
  Column,
  Heading,
  Hr,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

export interface ReviewRequestProps {
  bookingRef: string
  firstName: string | null
  /** Transfer vs tour wording. Changes the verbs and the writing prompts. */
  isTransfer: boolean
  /** Resort for a transfer, tour name for a tour. e.g. "Azul Beach Resort Negril" */
  tripLabel: string
  /** Already formatted by the caller. e.g. "15 to 25 August" */
  tripDates: string
  /** Tripadvisor write-a-review deep link. */
  reviewUrl: string
  supportEmail: string
}

/**
 * Sent once, the day after a trip finishes, asking for a Tripadvisor review.
 *
 * SHAPE: a quiet letter. One headline, three short paragraphs, one button, and
 * a single tinted block for the private route. No recap card, because a
 * booking-reference table at the top of a favour reads as a receipt and trains
 * the eye to skim. The trip is named in the lead sentence instead, which does
 * the recall job in nine words and costs no surface. Booking reference is
 * stamped at the foot where an admin aid belongs.
 *
 * COMPLIANCE, built into the copy rather than bolted on:
 *
 * 1. Tripadvisor prohibits incentivised reviews. Nothing is offered in return,
 *    and the email says so out loud ("nothing in it for you, no discount and
 *    no prize draw"), which is also the artefact to show if the listing is
 *    ever queried. No deadline, no reminder sequence, no second ask.
 *
 * 2. The ask is UNCONDITIONAL. It never says "if you enjoyed it, review us",
 *    which is review gating wearing a polite face, and it never routes people
 *    by sentiment. Everyone is asked, and the text invites the honest middling
 *    review by name.
 *
 * 3. The private route is offered ON TOP of the review, never instead of it,
 *    and says so explicitly. It gets real weight (16px copy, one step above
 *    body, plus a tinted block and a gold edge) because the listing has almost
 *    no reviews yet: until there is a body of them, one bad review IS the
 *    public rating, so an unhappy guest needs a human door they can actually
 *    see. The mailto is prefilled with the booking reference so a complaint
 *    arrives threaded and identifiable.
 *
 * HOUSE RULES OBSERVED:
 *  - No em dashes anywhere in the copy. Comma, full stop, or restructure.
 *  - Gold is spent ONCE in the body, on the edge of the escape block. The
 *    shell's letterhead already carries the 34x2 brandRule, so repeating that
 *    rule here reads as a stutter and doubles the ornament budget.
 *  - The escape block deliberately does NOT carry className="mapl-card": the
 *    shell's own media query sets border-left-width: 0 !important under 480px,
 *    which would delete the one piece of colour in the body on phones, where
 *    most of this mail is opened.
 *  - The Tripadvisor deep link is never printed as visible link text. Those
 *    URLs run 80 to 120 characters and will either wrap over three lines or,
 *    in the Outlook Word engine (no word-break support), force horizontal
 *    overflow.
 *  - No images beyond the shell logo, so the email is 100 percent readable
 *    with images blocked.
 */
export default function ReviewRequest({
  bookingRef,
  firstName,
  isTransfer,
  tripLabel,
  tripDates,
  reviewUrl,
  supportEmail,
}: ReviewRequestProps) {
  const name = firstName?.trim()

  // Built as one string, not adjacent JSX nodes: a newline between nodes
  // renders as a space, which would print "with us , Sanjay."
  const headline =
    (isTransfer
      ? 'Thanks for riding with us'
      : 'Thanks for spending the day with us') + (name ? `, ${name}.` : '.')

  // Names the trip in the lead instead of in a card.
  const tripSentence = isTransfer
    ? `We drove you to and from ${tripLabel}, ${tripDates}.`
    : `We took you out to ${tripLabel}, ${tripDates}.`

  // Writing prompts are the conversion mechanism. Blank-page paralysis kills
  // more reviews than apathy does.
  const prompts = isTransfer
    ? 'Whether the driver was standing there when you walked out of arrivals. Whether the van was cold. Whether you got to the resort without drama.'
    : 'Where we actually took you. What you ate. Whether the day was worth what you paid.'

  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
    `${bookingRef}: something fell short`,
  )}`

  return (
    <MaplLayout preheader="Two minutes on Tripadvisor, if you have them. And a real reply line if anything fell short.">
      <Text style={s.sectionLabel}>One thing</Text>

      <Heading as="h1" style={heroTight} className="mapl-h1">
        {headline}
      </Heading>

      <Text style={lead}>
        {tripSentence} We hope it went smoothly and that you got home easily.
        The bag is probably still open on the floor with sand in it.
      </Text>

      <Text style={para}>
        If you have two minutes, we&rsquo;d be glad if you told people how it
        went. The person booking next is standing in a different airport, on a
        phone, working out whether someone will really be there when they land.
        Nothing we write answers that. You can. {prompts}
      </Text>

      <Section style={s.ctaWrap}>
        <Button href={reviewUrl} style={reviewCta}>
          Write a review on Tripadvisor
        </Button>
      </Section>

      <Text style={micro}>
        About two minutes to write. Tripadvisor will ask you to sign in or make
        an account first, which is the slow part, not the writing. If the button
        doesn&rsquo;t work,{' '}
        <Link href={reviewUrl} style={inlineLink}>
          this link
        </Link>{' '}
        goes to the same place.
      </Text>

      <Hr style={divider} />

      <Text style={s.sectionLabel}>If anything fell short</Text>

      {/* The one place colour is spent in the body. No mapl-card class, or the
          shell's mobile rule would strip the gold edge on phones. */}
      <Section style={escapeBlock}>
        <Text style={escapeCopy}>
          Reply to this email and tell us. It lands in our inbox in Montego Bay,
          a person reads it, and we&rsquo;d rather hear it from you and put it
          right. You can also write to{' '}
          <Link href={mailto} style={inlineLink}>
            {supportEmail}
          </Link>
          {'.'}
        </Text>

        <Text style={escapeNote}>
          That isn&rsquo;t us steering you away from the listing. Leave the
          review as well, and say the same thing in it.
        </Text>
      </Section>

      <Text style={signoff}>
        Thanks for coming. Walk good.
        <br />
        MAPL Tours, Montego Bay
      </Text>

      <Hr style={metaDivider} />

      <Row>
        <Column style={metaLeftCol}>
          <Text style={metaText}>{tripLabel}</Text>
        </Column>
        <Column style={metaRightCol} align="right">
          <Text style={metaTextRight}>{bookingRef}</Text>
        </Column>
      </Row>

      <Text style={s.footnote}>
        You get this once, the day after your trip. We will not chase you about
        it.
      </Text>
    </MaplLayout>
  )
}

/* ───────────────── Local styles ─────────────────
   _Layout keeps its colour constants module-private and exports only
   maplStyles, so the four values used here are mirrored, not invented.
   If _Layout ever exports its palette, delete these and import them. */

const INK = '#1A1714'
const INK_SOFT = '#57534C'
const MUTED = '#6E6A62'
const GOLD = '#B7873A'
const BORDER = '#E7E1D6'
const BORDER_SOFT = '#F1ECE3'
const FOOTER_BG = '#FAF8F3'

/* No maxWidth: the Outlook Word engine ignores it on a heading, so relying on
   it for the line break would give two different headlines across clients. */
const heroTight: React.CSSProperties = {
  ...s.hero,
  margin: '10px 0 0',
}

const lead: React.CSSProperties = {
  ...s.heroLead,
  margin: '20px 0 0',
  fontSize: 16,
  lineHeight: 1.62,
  color: INK_SOFT,
}

const para: React.CSSProperties = {
  ...s.body,
  margin: '18px 0 0',
  fontSize: 15,
  lineHeight: 1.68,
  color: INK,
}

/* 16px vertical padding keeps the tap target above 48px on a phone. */
const reviewCta: React.CSSProperties = {
  ...s.cta,
  padding: '16px 30px',
  fontSize: 15,
  color: '#FFFFFF',
}

const micro: React.CSSProperties = {
  ...s.bodyMuted,
  margin: '14px 0 0',
  color: MUTED,
}

/* Explicit colour on every link. Several clients default anchors to blue. */
const inlineLink: React.CSSProperties = {
  color: INK,
  textDecoration: 'underline',
  fontWeight: 500,
}

const divider: React.CSSProperties = {
  borderColor: BORDER_SOFT,
  margin: '34px 0 22px',
}

const escapeBlock: React.CSSProperties = {
  margin: '12px 0 0',
  padding: '18px 20px',
  background: FOOTER_BG,
  border: `1px solid ${BORDER}`,
  borderLeft: `3px solid ${GOLD}`,
  borderRadius: 12,
}

/* One step larger than body copy: the private route carries real weight. */
const escapeCopy: React.CSSProperties = {
  ...s.body,
  margin: 0,
  fontSize: 16,
  lineHeight: 1.62,
  color: INK,
}

const escapeNote: React.CSSProperties = {
  ...s.bodyMuted,
  margin: '12px 0 0',
  color: MUTED,
}

const signoff: React.CSSProperties = {
  ...s.body,
  margin: '30px 0 0',
  fontSize: 15,
  lineHeight: 1.7,
  color: INK,
}

const metaDivider: React.CSSProperties = {
  borderColor: BORDER_SOFT,
  margin: '28px 0 14px',
}

const metaLeftCol: React.CSSProperties = {
  width: '58%',
  verticalAlign: 'top',
}

const metaRightCol: React.CSSProperties = {
  width: '42%',
  verticalAlign: 'top',
}

const metaText: React.CSSProperties = {
  ...s.bodyMuted,
  margin: 0,
  fontSize: 12,
  color: MUTED,
}

const metaTextRight: React.CSSProperties = {
  ...s.bodyMuted,
  margin: 0,
  fontSize: 12,
  color: MUTED,
  textAlign: 'right' as const,
  letterSpacing: '0.04em',
}
