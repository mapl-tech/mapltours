import { Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'

export interface VideoApprovedProps {
  firstName?: string | null
  experienceTitle?: string | null
  experienceId?: number
  /** Total approved videos this user now has (across all experiences) */
  approvedCount: number
  /** Videos still required to unlock the next 5% reward */
  remainingForReward: number
  /** True if this approval *just* unlocked a reward */
  rewardJustUnlocked?: boolean
}

/**
 * Sent when an admin flips a clip to `approved`. The message leans into
 * the reward milestone so the user feels progress — classic engagement loop.
 */
export default function VideoApproved({
  firstName,
  experienceTitle,
  experienceId,
  approvedCount,
  remainingForReward,
  rewardJustUnlocked,
}: VideoApprovedProps) {
  const name = firstName?.trim() || 'there'
  const expLink = experienceId
    ? `${siteUrl()}/experience/${experienceId}`
    : `${siteUrl()}`

  const statusLine = rewardJustUnlocked
    ? 'You just unlocked a 5% reward ✨'
    : remainingForReward === 1
      ? 'One more approved clip unlocks 5% off your next trip.'
      : `${remainingForReward} more approved clips unlock 5% off your next trip.`

  return (
    <MaplLayout preheader={`Your clip is live on MAPL.${experienceTitle ? ` ${experienceTitle}.` : ''}`}>
      <Text style={s.kicker}>Live on MAPL</Text>
      <Heading style={s.heading}>
        Your clip is on the wall, {name}.
      </Heading>
      <Text style={s.body}>
        {experienceTitle
          ? <>Guests exploring <strong style={{ color: '#fff' }}>{experienceTitle}</strong> will now see your video in the swipe gallery.</>
          : <>Guests can now swipe through your clip on the experience page.</>}
      </Text>

      {/* Progress panel */}
      <div style={s.panel}>
        <Text style={s.panelKicker}>
          {rewardJustUnlocked ? 'Reward unlocked' : 'Reward progress'}
        </Text>
        <Text style={s.panelBody}>
          <strong style={{ color: '#fff' }}>{approvedCount} approved video{approvedCount === 1 ? '' : 's'}</strong> · {statusLine}
        </Text>

        {/* Visual progress — cap at 5, but keep showing beyond for users on the 10/15/… ladder */}
        <div style={{ marginTop: 14, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            height: 6,
            width: `${Math.min(100, ((approvedCount % 5 || (rewardJustUnlocked ? 5 : 0)) / 5) * 100)}%`,
            background: rewardJustUnlocked
              ? '#00A550'
              : 'linear-gradient(90deg, #FFB300, #E69A00)',
            borderRadius: 9999,
          }} />
        </div>
      </div>

      <div style={s.ctaWrap}>
        <Link href={expLink} style={s.cta}>See it live →</Link>
      </div>

      <Text style={s.footnote}>
        Keep sharing — the best MAPL moments always come from travellers in the thick of it.
      </Text>
    </MaplLayout>
  )
}
