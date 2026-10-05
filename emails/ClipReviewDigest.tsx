import { Fragment } from 'react'
import { Button, Heading, Text, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s, siteUrl } from './_Layout'
import { clipDigestSubject, UNLISTED_TOUR, type ClipDigest } from '@/lib/clip-digest'
import { VIDEO_REWARD_MILESTONE } from '@/lib/video-rules'

export interface ClipReviewDigestProps extends ClipDigest {
  firstName: string | null
}

// The light layout's own colours, so nothing here is a light literal.
const REWARD = '#1D7A50' // layout GREEN: success and the reward, 5.31:1 on the card
const AMBER = '#7A5A08' // not published, and the reviewer's note: 5.90:1 on the note panel
const NOTE_BG = '#FCF6E4' // the layout's highlight panel
const NOTE_BORDER = '#F0E4BE'
const TRACK = '#E7E1D6' // layout BORDER; the green fill is 4.08:1 against it
const LINK = { color: '#1A1714', textDecoration: 'underline' }
// A text link that stands alone gets a 44px target, not an 18px one.
const LONE_LINK = { ...LINK, display: 'inline-block', padding: '12px 4px' }
// Guest- and reviewer-typed text wraps instead of widening the email.
const WRAP = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const }
// The secondary button: a 45px target and a 3.47:1 edge on the card.
const GHOST = { ...s.ctaGhost, padding: '13px 26px', border: '1px solid #8F897F' }

/** A reviewer's note with its own line breaks kept (Outlook ignores pre-line). */
function noteLines(note: string) {
  return note.split(/\r?\n/).map((line, i) => (
    <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>
  ))
}

/**
 * The evening email about a guest's reviewed clips (app/api/clip-digest): one
 * a day, whatever was reviewed, instead of one per clip. Live clips first,
 * each linking to its place in the tour's reel; the reward next, because that
 * is where it is earned (when it unlocks, the main button books with it); any
 * clip we could not publish after, with the reviewer's note as help and the
 * way to send another. One main action per email: book with the reward, see
 * the one live clip, or (several live, each linked above) post another.
 */
export default function ClipReviewDigest({
  firstName,
  approved,
  rejected,
  approvedTotal,
  remainingForReward,
  reward,
}: ClipReviewDigestProps) {
  const name = firstName?.trim() || null
  const live = approved.length
  const heading = live > 0
    ? `${live === 1 ? 'Your clip is live' : `${live} of your clips are live`}${name ? `, ${name}` : ''}.`
    : `We couldn’t post ${rejected.length === 1 ? 'this one' : 'these'}${name ? `, ${name}` : ''}.`
  const preheader = live > 0
    ? reward
      ? `Your ${reward.percent}% off is ready for your next tour.`
      : `${approvedTotal} approved so far. ${remainingForReward === 1 ? 'One more' : `${remainingForReward} more`} and your next tour is 5% off.`
    : 'Here’s what works best, and a quick way to send another.'
  const filled = reward ? VIDEO_REWARD_MILESTONE : approvedTotal % VIDEO_REWARD_MILESTONE
  const pct = Math.round((filled / VIDEO_REWARD_MILESTONE) * 100)
  const expires = reward?.expiresAt ? new Date(reward.expiresAt) : null
  const until = expires && !Number.isNaN(expires.getTime())
    ? expires.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Jamaica' })
    : null
  // Where "post another" leads: the tour of the first clip in this email.
  const postAnother = (approved[0]?.link ?? rejected[0]?.link ?? `${siteUrl()}/explore`).replace(/\?clip=.*$/, '?clips=post')
  const primary: 'book' | 'see' | 'post' | null = live === 0 ? null : reward ? 'book' : live === 1 ? 'see' : 'post'
  const tourName = (title: string) => (title === UNLISTED_TOUR ? 'A tour no longer listed' : title)

  return (
    <MaplLayout title={clipDigestSubject({ approved, rejected, reward })} preheader={preheader}>
      <Text style={{ ...s.kicker, color: live > 0 ? REWARD : AMBER }}>
        {live > 0 ? (live === 1 ? 'Clip approved' : 'Clips approved') : 'Not published'}
      </Text>
      <Heading className="mapl-h1" style={{ ...s.heading, ...WRAP }}>{heading}</Heading>

      {live > 0 && (
        <>
          <Text className="mapl-body" style={s.body}>
            {live === 1
              ? approved[0].tourTitle === UNLISTED_TOUR
                ? <>Anyone looking at the tours can watch it now.</>
                : <>Anyone looking at <strong>{approved[0].tourTitle}</strong> can watch it now, right after the tour&rsquo;s own video.</>
              : <>Anyone looking at these tours can watch them now, right after each tour&rsquo;s own video:</>}
          </Text>
          {live > 1 && (
            <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
              {approved.map((c) => (
                <li key={c.clipId} className="mapl-body" style={{ ...s.body, margin: 0 }}>
                  {c.tourTitle === UNLISTED_TOUR
                    ? tourName(c.tourTitle)
                    : <Link href={c.link} style={LONE_LINK}>{c.tourTitle}</Link>}
                </li>
              ))}
            </ul>
          )}

          {/* The reward: announced with its code when one of these approvals
              unlocked it, otherwise the progress toward it. */}
          {reward ? (
            <div style={s.panel}>
              <Heading as="h2" style={{ ...s.panelKicker, color: REWARD }}>Reward unlocked</Heading>
              <Text className="mapl-body" style={s.panelBody}>
                <strong>Your {reward.percent}%&nbsp;off is ready.</strong> It comes off automatically at checkout when you book a tour signed in to this account. Nothing to type.
              </Text>
              <Text className="mapl-body" style={{ ...s.panelBody, marginTop: 12 }}>
                For your records: <span style={s.codePill}>{reward.code}</span>
              </Text>
              <Text className="mapl-body" style={{ ...s.panelBody, marginTop: 12 }}>
                {`It’s also on your profile.${until ? ` Good until ${until}.` : ''}`}
              </Text>
            </div>
          ) : approvedTotal >= 1 && (
            <div style={s.panel}>
              <Heading as="h2" style={s.panelKicker}>Reward progress</Heading>
              <Text className="mapl-body" style={s.panelBody}>
                <strong>{approvedTotal} approved so far.</strong>{' '}
                {remainingForReward === 1
                  ? <>One more unlocks 5%&nbsp;off your next tour booking.</>
                  : <>{remainingForReward} more unlock 5%&nbsp;off your next tour booking.</>}
              </Text>
              {/* A two-cell table: Outlook sizes neither a div's width nor
                  its height. */}
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 14, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    {pct > 0 && <td width={`${pct}%`} style={{ height: 6, fontSize: 0, lineHeight: '6px', background: REWARD, borderRadius: pct === 100 ? 9999 : '9999px 0 0 9999px' }}>&nbsp;</td>}
                    {pct < 100 && <td style={{ height: 6, fontSize: 0, lineHeight: '6px', background: TRACK, borderRadius: pct === 0 ? 9999 : '0 9999px 9999px 0' }}>&nbsp;</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={s.ctaWrap}>
            {primary === 'book' && reward && (
              <Button href={`${siteUrl()}/explore`} className="mapl-cta-block" style={s.cta}>Book with my {reward.percent}%&nbsp;off →</Button>
            )}
            {primary === 'see' && (
              <Button href={approved[0].link} className="mapl-cta-block" style={s.cta}>See it live →</Button>
            )}
            {primary === 'post' && (
              <Button href={postAnother} className="mapl-cta-block" style={s.cta}>Post another clip →</Button>
            )}
          </div>
          {primary === 'book' && live === 1 && approved[0].tourTitle !== UNLISTED_TOUR && (
            <Text className="mapl-body mapl-cta-block" style={{ ...s.body, margin: '6px 0 0' }}>
              <Link href={approved[0].link} style={LONE_LINK}>See it live</Link>
            </Text>
          )}
        </>
      )}

      {rejected.length > 0 && (
        <>
          <Text className="mapl-body" style={{ ...s.body, marginTop: live > 0 ? 28 : undefined }}>
            {live > 0
              ? (rejected.length === 1 ? 'One clip didn’t quite fit the gallery this time.' : `${rejected.length} clips didn’t quite fit the gallery this time.`)
              : <>Thanks for sending {rejected.length === 1 ? 'a clip' : 'your clips'}. {rejected.length === 1 ? 'It' : 'They'} didn&rsquo;t quite fit the gallery this time, but we&rsquo;d genuinely love another take from you.</>}
          </Text>
          {rejected.map((c) => (
            <div key={c.clipId} style={{ ...s.panel, background: NOTE_BG, borderColor: NOTE_BORDER }}>
              <Heading as="h2" style={{ ...s.panelKicker, color: AMBER }}>
                {`${c.notes ? 'A note from our reviewer' : 'Not published'} · ${tourName(c.tourTitle)}`}
              </Heading>
              {c.notes && (
                <Text className="mapl-body" style={{ ...s.panelBody, ...WRAP }}>{noteLines(c.notes)}</Text>
              )}
            </div>
          ))}
          <div style={s.panel}>
            <Heading as="h2" style={s.panelKicker}>What we&rsquo;re looking for</Heading>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {['Filmed upright, up to 60 seconds', 'The tour itself: faces, food, views, sound', 'Original footage filmed on the tour', 'Clean audio, steady framing'].map((item) => (
                <li key={item} className="mapl-body" style={{ ...s.panelBody, margin: '0 0 2px' }}>{item}</li>
              ))}
            </ul>
          </div>
          {primary !== 'post' && (
            <div style={s.ctaWrap}>
              <Button href={rejected[0].link} className="mapl-cta-block" style={live > 0 ? GHOST : s.cta}>Post another clip →</Button>
            </div>
          )}
          <Text style={{ ...s.footnote, marginTop: 8 }}>
            Not sure what we meant? Reply to this email. A person reads every&nbsp;one.
          </Text>
        </>
      )}

      {rejected.length === 0 && primary !== 'post' && (
        <Text style={s.footnote}>
          Got more clips from your trip? <Link href={postAnother} style={LINK}>Post another clip</Link>. Every approved one counts.
        </Text>
      )}
    </MaplLayout>
  )
}
