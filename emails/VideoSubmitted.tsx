import { Button, Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'
import { experiences, slugify } from '@/lib/experiences'

export interface VideoSubmittedProps {
  firstName?: string | null
  experienceTitle?: string | null
  /** The tour, so "Post another clip" opens its upload sheet (?clips=post). */
  experienceId?: number
}

// The layout's GREEN (success + reward discount): 5.14:1 on the panel.
const REWARD = '#1D7A50'
// Amber, waiting on a decision (the profile's "in review" colour): 6.38:1.
const PENDING = '#7A5A08'
// Guest-typed text (a name) wraps instead of widening the email on a phone.
const WRAP = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const }

/**
 * Sent the moment a guest posts a clip (status = pending). The review
 * outcome comes in the evening email (app/api/clip-digest). The layout is
 * light, so emphasis inherits INK; never a light literal like #fff.
 */
export default function VideoSubmitted({ firstName, experienceTitle, experienceId }: VideoSubmittedProps) {
  const name = firstName?.trim()
  const exp = experienceId != null ? experiences.find((e) => e.id === experienceId) : undefined
  // The catalogue's title when it has the tour, so the words and the button
  // can never name two different tours.
  const tour = exp?.title ?? experienceTitle ?? null
  const postLink = exp ? `${siteUrl()}/experience/${slugify(exp.title)}?clips=post` : `${siteUrl()}/explore`
  return (
    <MaplLayout
      title="Your MAPL Tours Jamaica clip is in review"
      preheader={`Thanks for posting${tour ? ` from ${tour}` : ''}. We'll email you once it's reviewed.`}
    >
      <Text style={{ ...s.kicker, color: PENDING }}>In review</Text>
      <Heading className="mapl-h1" style={{ ...s.heading, ...WRAP }}>
        {name ? `Thanks, ${name}. Your clip is in.` : 'Thanks. Your clip is in.'}
      </Heading>
      <Text className="mapl-body" style={s.body}>
        We watch every clip before it goes up. We&rsquo;ll email you once
        {tour ? <> your clip from <strong>{tour}</strong> has been reviewed</> : <> it&rsquo;s been reviewed</>}, usually within a day.
      </Text>

      <div style={s.panel}>
        <Heading as="h2" style={s.panelKicker}>Your reward</Heading>
        <Text className="mapl-body" style={s.panelBody}>
          Every approved clip counts. Five get you <strong style={{ color: REWARD }}>5%&nbsp;off your next tour booking</strong>.
        </Text>
      </div>

      <div style={s.ctaWrap}>
        <Button href={postLink} className="mapl-cta-block" style={s.cta}>
          {exp ? 'Post another clip →' : 'Explore tours →'}
        </Button>
      </div>

      <Text style={s.footnote}>
        <Link href={`${siteUrl()}/profile#rewards`} style={{ color: '#1A1714', textDecoration: 'underline' }}>Track your progress</Link>.
        Questions? Reply to this email. A person reads every&nbsp;one.
      </Text>
    </MaplLayout>
  )
}
