import { Button, Heading, Text, Link, Img } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface NewClipAlertProps {
  tour: string
  /** The guest's name as their account has it, or null. */
  name: string | null
  /** The guest's address, or null. Replies to this email go to it. */
  email: string | null
  /** The guest's caption, already clipped; rendered as text, never markup. */
  caption: string | null
  clipId: string
  /** The thumbnail made at upload, or null. */
  posterUrl: string | null
  durationSeconds: number | null
}

// Amber, the admin queue's colour for clips waiting on a decision: 6.38:1 on white.
const AMBER = '#7A5A08'
// Guest-typed text wraps instead of widening the email on a phone.
const WRAP = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const }

/** At most `max` characters, cut at a word, with an ellipsis when cut. */
function clipText(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * To us, when a guest posts a clip: it waits, hidden, in /admin/videos until
 * someone approves it. Names the guest and shows the clip's first frame with
 * the button right under it, so it can be triaged from a phone's first
 * screen; the button opens the admin queue on that clip. Its own template
 * rather than OpsAlert, which pages operations for money problems from the
 * Stripe webhook and stays as it is.
 */
export default function NewClipAlert({ tour, name, email, caption, clipId, posterUrl, durationSeconds }: NewClipAlertProps) {
  const who = name ?? 'A guest'
  const review = `${siteUrl()}/admin/videos?clip=${encodeURIComponent(clipId)}`
  const secs = durationSeconds && durationSeconds > 0 ? `${Math.round(durationSeconds)}-second clip` : null
  return (
    <MaplLayout
      title={`New guest clip to review: ${tour}`}
      preheader={`${who} posted a clip from ${tour}${caption ? `: "${clipText(caption, 80)}"` : ''}. It stays hidden until you approve it.`}
    >
      <Text style={{ ...s.kicker, color: AMBER }}>Needs your review</Text>
      <Heading className="mapl-h1" style={{ ...s.heading, ...WRAP }}>
        {`${who} posted a clip from ${tour}`}
      </Heading>
      <Text className="mapl-body" style={s.body}>It stays off the site until you approve it.</Text>

      {posterUrl && (
        <Link href={review} style={{ display: 'inline-block', marginTop: 16 }}>
          <Img
            src={posterUrl}
            width="120"
            alt={`Watch the clip from ${tour}`}
            style={{ display: 'block', width: 120, height: 'auto', maxWidth: '100%', borderRadius: 12, border: 0 }}
          />
        </Link>
      )}
      {secs && <Text style={{ ...s.note, margin: '6px 0 0' }}>{secs}</Text>}

      <div style={s.ctaWrap}>
        <Button href={review} className="mapl-cta-block" style={s.cta}>Watch and review →</Button>
      </div>

      <div style={s.panel}>
        <Heading as="h2" style={s.panelKicker}>Posted by</Heading>
        <Text className="mapl-body" style={{ ...s.panelBody, ...WRAP }}>
          {name ?? 'No name on the account'}
          {email && <><br />{email}</>}
        </Text>
        {caption && (
          <>
            <Heading as="h2" style={{ ...s.panelKicker, marginTop: 16 }}>Caption</Heading>
            <Text className="mapl-body" style={{ ...s.panelBody, ...WRAP }}>{caption}</Text>
          </>
        )}
      </div>

      <Text style={{ ...s.footnote, ...WRAP }}>
        {`${email ? `Reply to this email to write to ${name ?? 'the guest'}. ` : ''}Clip ${clipId}`}
      </Text>
    </MaplLayout>
  )
}
