import { experiences, slugify } from './experiences'
import { VIDEO_REWARD_MILESTONE } from './video-rules'

/**
 * The nightly clip-review email, as data: what app/api/clip-digest sends one
 * guest about the clips reviewed since their last one (migration 036). Pure,
 * so the grouping, the links and the subject are tested without a database.
 */

/** A clip as claim_clip_reviews returns it. */
export interface ReviewedClip {
  id: string
  experience_id: number
  status: 'approved' | 'rejected'
  admin_notes: string | null
  caption: string | null
  reviewed_at: string
}

/** A reward migration 003's trigger granted for one of these approvals. */
export interface DigestReward {
  code: string
  percent: number
  expiresAt: string | null
}

export interface ClipDigest {
  /** Live now, oldest review first, each linking to its reel (?clip=). */
  approved: { clipId: string; tourTitle: string; link: string }[]
  /** Not published, with the reviewer's note, each linking to post another (?clips=post). */
  rejected: { clipId: string; tourTitle: string; notes: string | null; link: string }[]
  /** Every approved clip the guest has, all tours. */
  approvedTotal: number
  /** Approvals still needed for the next 5%; 0 when this email announces one. */
  remainingForReward: number
  reward: DigestReward | null
}

/** A clip whose tour has left the catalogue: said plainly, linked to the tours. */
export const UNLISTED_TOUR = 'a tour no longer listed'

export function buildClipDigest(
  rows: ReviewedClip[],
  approvedTotal: number,
  reward: DigestReward | null,
  site: string,
): ClipDigest {
  const tour = (id: number) => experiences.find((e) => e.id === id)
  const ordered = [...rows].sort((a, b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at))
  const approved = ordered
    .filter((r) => r.status === 'approved')
    .map((r) => {
      const exp = tour(r.experience_id)
      return {
        clipId: r.id,
        tourTitle: exp?.title ?? UNLISTED_TOUR,
        link: exp ? `${site}/experience/${slugify(exp.title)}?clip=${encodeURIComponent(r.id)}` : `${site}/explore`,
      }
    })
  const rejected = ordered
    .filter((r) => r.status === 'rejected')
    .map((r) => {
      const exp = tour(r.experience_id)
      return {
        clipId: r.id,
        tourTitle: exp?.title ?? UNLISTED_TOUR,
        notes: r.admin_notes?.trim() || null,
        link: exp ? `${site}/experience/${slugify(exp.title)}?clips=post` : `${site}/explore`,
      }
    })
  // A milestone reached with no reward row (one already spent, or a clip
  // approved again after a rejection) earns nothing new: the next one is a
  // full five away, never "0 more".
  const remainingForReward = reward ? 0 : VIDEO_REWARD_MILESTONE - (approvedTotal % VIDEO_REWARD_MILESTONE)
  return { approved, rejected, approvedTotal, remainingForReward, reward }
}

export function clipDigestSubject(d: Pick<ClipDigest, 'approved' | 'rejected' | 'reward'>): string {
  const live = d.approved.length
  if (live > 0) {
    const head = live === 1 ? 'Your clip is live' : `${live} of your clips are live`
    return d.reward ? `${head}, and you unlocked ${d.reward.percent}% off` : `${head} on MAPL Tours Jamaica`
  }
  return d.rejected.length === 1
    ? "We couldn't publish your MAPL Tours Jamaica clip"
    : "We couldn't publish your MAPL Tours Jamaica clips"
}
