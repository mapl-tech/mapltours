import { Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface VideoRejectedProps {
  firstName?: string | null
  experienceTitle?: string | null
  experienceId?: number
  /** Admin-supplied reason shown verbatim in the email */
  adminNotes?: string | null
}

/**
 * Sent when an admin rejects a clip. Tone: warm, specific, encouraging —
 * we want the user to submit again, not feel shamed. Admin notes are surfaced
 * in their own panel so the reason is unmissable.
 */
export default function VideoRejected({
  firstName,
  experienceTitle,
  experienceId,
  adminNotes,
}: VideoRejectedProps) {
  const name = firstName?.trim() || 'there'
  const expLink = experienceId
    ? `${siteUrl()}/experience/${experienceId}`
    : siteUrl()

  return (
    <MaplLayout preheader="We couldn't publish this clip — but we'd love another take.">
      <Text style={s.kicker}>Couldn&rsquo;t publish</Text>
      <Heading style={s.heading}>
        We couldn&rsquo;t put this one live, {name}.
      </Heading>
      <Text style={s.body}>
        Thanks for sending a clip
        {experienceTitle ? <> from <strong style={{ color: '#fff' }}>{experienceTitle}</strong></> : null}. It didn&rsquo;t quite fit our publishing standards — but we&rsquo;d genuinely love another take from you.
      </Text>

      {/* Admin notes (if provided) */}
      {adminNotes && adminNotes.trim().length > 0 && (
        <div style={{ ...s.panel, borderColor: 'rgba(255, 90, 54, 0.35)' }}>
          <Text style={{ ...s.panelKicker, color: '#FF5A36' }}>From our curation team</Text>
          <Text style={s.panelBody}>{adminNotes.trim()}</Text>
        </div>
      )}

      {/* Gentle guidance so the next submission lands cleanly */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>What we&rsquo;re looking for</Text>
        <Text style={s.panelBody}>
          · Shot vertically (9:16), under 60 seconds<br />
          · The experience itself — faces, food, views, sound<br />
          · Original footage filmed on the tour<br />
          · Clean audio, steady framing
        </Text>
      </div>

      <div style={s.ctaWrap}>
        <Link href={expLink} style={s.cta}>Try another clip →</Link>
      </div>

      <Text style={s.footnote}>
        Approved clips still count toward your <strong style={{ color: '#FFB300' }}>5% off</strong> reward. Thanks for sharing your trip with us.
      </Text>
    </MaplLayout>
  )
}
