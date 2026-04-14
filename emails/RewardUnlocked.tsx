import { Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface RewardUnlockedProps {
  firstName?: string | null
  /** Coupon code, e.g. "MAPL-AB12-5" */
  code: string
  /** Percent discount (almost always 5 today, but future-proofed) */
  percent: number
  /** ISO timestamp — shown as a friendly date in the footer */
  expiresAt?: string | null
  /** Which milestone this reward corresponds to (5, 10, 15…) */
  milestone?: number
}

/**
 * Celebratory email fired when a user crosses a reward milestone (every 5
 * approved videos). The code pill is the visual centrepiece — copy-paste
 * friendly, gold, and unmistakable.
 */
export default function RewardUnlocked({
  firstName,
  code,
  percent,
  expiresAt,
  milestone = 5,
}: RewardUnlockedProps) {
  const name = firstName?.trim() || 'there'
  const expiresPretty = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <MaplLayout preheader={`🎉 ${percent}% off your next MAPL trip — code ${code}`}>
      <Text style={{ ...s.kicker, color: '#00A550' }}>Reward unlocked</Text>
      <Heading style={s.heading}>
        {name}, that&rsquo;s {percent}% off — on us.
      </Heading>
      <Text style={s.body}>
        You&rsquo;ve shared {milestone} approved clips with the MAPL community{milestone === 5 ? ' — the biggest milestone.' : '.'} We saved you <strong style={{ color: '#fff' }}>{percent}% off your next trip</strong> as a thank-you. It&rsquo;s already on your account and will apply automatically at checkout.
      </Text>

      {/* Code pill */}
      <div style={{ textAlign: 'center', margin: '28px 0 8px' }}>
        <div style={s.codePill}>{code}</div>
        <Text style={{
          margin: '10px 0 0',
          fontSize: 11.5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.5)',
          fontFamily: 'Helvetica Neue, Arial, sans-serif',
        }}>
          Tap to copy · auto-applied at checkout
        </Text>
      </div>

      <div style={s.ctaWrap}>
        <Link href={`${siteUrl()}/explore`} style={s.cta}>Plan my next trip →</Link>
      </div>

      {/* Redemption mechanics */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>How to use it</Text>
        <Text style={s.panelBody}>
          · Works on any future MAPL booking<br />
          · Auto-applies at checkout — no code needed<br />
          · One-time use · not stackable with other offers
          {expiresPretty && <><br />· Valid through <strong style={{ color: '#fff' }}>{expiresPretty}</strong></>}
        </Text>
      </div>

      <Text style={s.footnote}>
        Every five approved clips unlocks another 5%. Keep going — Jamaica looks good on you.
      </Text>
    </MaplLayout>
  )
}
