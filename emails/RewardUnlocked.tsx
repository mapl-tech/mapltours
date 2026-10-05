import { Button, Heading, Text } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface RewardUnlockedProps {
  firstName?: string | null
  /** Coupon code, e.g. "MAPL-AB12-5" */
  code: string
  /** Percent discount (almost always 5 today, but future-proofed) */
  percent: number
  /** ISO timestamp, shown as a friendly date in the footer */
  expiresAt?: string | null
  /** Which milestone this reward corresponds to (5, 10, 15…) */
  milestone?: number
}

/**
 * Celebratory email fired when a user crosses a reward milestone (every 5
 * approved videos). The code pill is the visual centrepiece. The layout is
 * light, so emphasis inherits its ink; never a light literal like #fff.
 */
export default function RewardUnlocked({
  firstName,
  code,
  percent,
  expiresAt,
  milestone = 5,
}: RewardUnlockedProps) {
  const name = firstName?.trim() || null
  const expires = expiresAt ? new Date(expiresAt) : null
  const expiresPretty = expires && !Number.isNaN(expires.getTime())
    ? expires.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Jamaica' })
    : null

  return (
    <MaplLayout
      title={`${percent}% off your next MAPL Tours Jamaica tour`}
      preheader={`Already on your account${expiresPretty ? `, good until ${expiresPretty}` : ''}. Nothing to type at checkout.`}
    >
      <Text style={s.kicker}>Reward unlocked</Text>
      <Heading className="mapl-h1" style={{ ...s.heading, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {name ? `${name}, that’s ${percent}% off, on us.` : `That’s ${percent}% off, on us.`}
      </Heading>
      <Text className="mapl-body" style={s.body}>
        You&rsquo;ve shared {milestone} approved clips with the MAPL Tours Jamaica community{milestone === 5 ? ', your first milestone.' : '.'} We saved you <strong>{percent}% off your next tour</strong> as a thank-you.
      </Text>

      {/* The code, then the way to use it, centred together */}
      <div style={{ textAlign: 'center', margin: '28px 0 8px' }}>
        <div style={s.codePill}>{code}</div>
        <Text style={{ ...s.note, margin: '10px 0 0' }}>
          For your records. Nothing to type at checkout.
        </Text>
      </div>

      <div style={{ ...s.ctaWrap, textAlign: 'center' }}>
        <Button href={`${siteUrl()}/explore`} className="mapl-cta-block" style={s.cta}>Book with my {percent}%&nbsp;off →</Button>
      </div>

      {/* Redemption mechanics */}
      <div style={s.panel}>
        <Heading as="h2" style={s.panelKicker}>How to use it</Heading>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li className="mapl-body" style={{ ...s.panelBody, margin: '0 0 2px' }}>Book any tour signed in to this account</li>
          <li className="mapl-body" style={{ ...s.panelBody, margin: '0 0 2px' }}>It comes off automatically at checkout</li>
          <li className="mapl-body" style={{ ...s.panelBody, margin: '0 0 2px' }}>Good for one booking</li>
          {expiresPretty && <li className="mapl-body" style={{ ...s.panelBody, margin: 0 }}>Valid through <strong>{expiresPretty}</strong></li>}
        </ul>
      </div>

      <Text style={s.footnote}>
        Every five approved clips unlocks another 5%. Keep going, Jamaica looks good on you.
      </Text>
    </MaplLayout>
  )
}
