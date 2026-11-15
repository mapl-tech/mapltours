import { Button, Heading, Link, Section, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/** One run of the comment: plain text, or a tag (the recipient's own is bold). */
export type MentionEmailPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; isYou: boolean }

export interface MentionNotificationProps {
  /** The tagger as their byline reads: "@ana.b" or "Ana". */
  authorLabel: string
  tourTitle: string
  /** "Negril", shown after the tour name when known. */
  destination?: string | null
  /** The comment, split so tags can be styled. Already capped in length. */
  parts: MentionEmailPart[]
  /** True when the comment was cut to fit; the quote then ends with an ellipsis. */
  truncated?: boolean
  commentUrl: string
  /** The signed stop link (also sent as List-Unsubscribe). */
  stopUrl: string
}

/* Dark gold for text on white: 6.9:1, the colour the layout already uses for
   highlighted headers. The brand --gold fails AA as text on white. */
const GOLD_INK = '#7A5A08'

/**
 * Sent when a guest is tagged in a tour comment. One idea per email: who
 * tagged you, where, what they said, and one button that opens the comment
 * itself, highlighted. The stop link is in the footnote and in the
 * List-Unsubscribe header, and the profile keeps the same switch.
 */
export default function MentionNotification({
  authorLabel,
  tourTitle,
  destination,
  parts,
  truncated,
  commentUrl,
  stopUrl,
}: MentionNotificationProps) {
  const quotePlain = parts.map((p) => p.text).join('') + (truncated ? '…' : '')
  const preview = quotePlain.length > 90 ? `${quotePlain.slice(0, 89).trimEnd()}…` : quotePlain
  const where = destination ? `${tourTitle}, ${destination}` : tourTitle

  return (
    <MaplLayout
      title={`${authorLabel} tagged you in a comment`}
      preheader={`On ${tourTitle}: “${preview}”`}
    >
      <Text style={{ ...s.kicker, color: GOLD_INK }}>New mention</Text>
      <Heading className="mapl-h1" style={{ ...s.heading, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {authorLabel} tagged you in a comment
      </Heading>
      <Text className="mapl-body" style={{ ...s.body, fontSize: 15 }}>
        On <strong>{where}</strong>:
      </Text>

      <Section
        style={{
          ...s.panel,
          margin: '14px 0 0',
          borderLeft: `3px solid ${GOLD_INK}`,
        }}
      >
        <Text className="mapl-body" style={{ ...s.panelBody, margin: 0, fontSize: 15, lineHeight: 1.6, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          “
          {parts.map((p, i) =>
            p.kind === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i} style={{ color: GOLD_INK, fontWeight: p.isYou ? 700 : 600 }}>
                {p.text}
              </span>
            ),
          )}
          {truncated ? '…' : ''}”
        </Text>
      </Section>

      <div style={{ ...s.ctaWrap, margin: '24px 0 4px', textAlign: 'center' }}>
        <Button href={commentUrl} className="mapl-cta-block" style={s.cta}>
          See the comment
        </Button>
      </div>
      <Text style={{ ...s.note, textAlign: 'center' }}>
        It opens right on the comment, so you can reply there.
      </Text>

      <Text style={s.footnote}>
        You are getting this because {authorLabel} tagged you on MAPL Tours Jamaica. Not for you?{' '}
        <Link href={stopUrl} style={{ color: s.footnote.color as string, textDecoration: 'underline' }}>
          Stop these emails
        </Link>
        . New mentions will still show on your profile.
      </Text>
    </MaplLayout>
  )
}
