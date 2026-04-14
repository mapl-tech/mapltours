import { Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface VideoSubmittedProps {
  firstName?: string | null
  experienceTitle?: string | null
}

/**
 * Sent immediately after a user uploads a clip (status = pending).
 * Reinforces the 5-video → 5%-off reward mechanic to drive re-uploads.
 */
export default function VideoSubmitted({ firstName, experienceTitle }: VideoSubmittedProps) {
  const name = firstName?.trim() || 'there'
  return (
    <MaplLayout preheader={`Thanks for sharing your clip${experienceTitle ? ` from ${experienceTitle}` : ''}. It's in review.`}>
      <Text style={s.kicker}>In review</Text>
      <Heading style={s.heading}>Thanks, {name}. Your clip is in.</Heading>
      <Text style={s.body}>
        Our curation team is reviewing your video
        {experienceTitle ? <> from <strong style={{ color: '#fff' }}>{experienceTitle}</strong></> : null}.
        You&rsquo;ll get another note the moment it goes live — usually within a day.
      </Text>

      {/* Reward progress nudge */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>MAPL Reward</Text>
        <Text style={s.panelBody}>
          Every approved clip moves you closer to <strong style={{ color: '#FFB300' }}>5% off your next trip</strong>. Keep sharing — five approved videos unlocks the discount.
        </Text>
      </div>

      <div style={s.ctaWrap}>
        <Link href={`${siteUrl()}/profile`} style={s.cta}>Track my progress →</Link>
      </div>

      <Text style={s.footnote}>
        Questions? Just reply to this email — we read every note.
      </Text>
    </MaplLayout>
  )
}
