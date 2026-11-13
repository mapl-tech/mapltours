import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VideoQueue, { decisionNote, liveClipHref, shownClips, tourTitle } from '../../components/admin/VideoQueue'
import type { AdminVideo } from '../../lib/tour-videos'
import { experiences, slugify } from '../../lib/experiences'

/**
 * The guest clip queue (/admin/videos, Nov 13 2026 rebuild): what the owner
 * is told after a decision, which clips a filter shows (a decided clip stays
 * put until the filter changes), where an approved clip lives, and the
 * queue as it first renders.
 */

const tour = experiences[0]
const clip = (id: string, status: AdminVideo['status'], extra: Partial<AdminVideo> = {}): AdminVideo => ({
  id, user_id: 'u-' + id, experience_id: tour.id, video_path: `u-${id}/${tour.id}-1.mp4`, thumbnail_path: null, duration_seconds: 24,
  size_bytes: 1, content_hash: null, caption: null, status, admin_notes: null, reviewed_by: null, reviewed_at: null,
  created_at: '2099-01-02T15:00:00Z', video_url: `https://cdn.example.com/${id}.mp4`, video_hevc_url: `https://cdn.example.com/m/${id}.hevc.mp4`,
  video_m_url: `https://cdn.example.com/m/${id}.mp4`, thumbnail_url: null, uploader_name: 'Ana Example', uploader_avatar_url: null,
  uploader_handle: null, uploader_email: null, ...extra,
})

describe('what the owner is told after a decision', () => {
  test('approve names the tour page it went on', () => {
    expect(decisionNote('approved', clip('a', 'pending'), '')).toEqual({ text: `Approved. It is on the ${tour.title} page now.` })
  })

  test('reject says whether a note goes out, and to whom', () => {
    expect(decisionNote('rejected', clip('a', 'pending'), 'Too dark').text).toBe("Rejected. Ana Example gets your note in this evening's email.")
    expect(decisionNote('rejected', clip('a', 'pending'), '').text).toBe("Rejected. It stays off the site; this evening's email tells Ana Example.")
    expect(decisionNote('rejected', clip('a', 'pending', { uploader_name: null }), '').text).toMatch(/tells the guest\.$/)
  })

  test('flag says the guest is not told', () => {
    expect(decisionNote('flagged', clip('a', 'pending'), 'faces').text).toBe('Flagged. It is hidden, and the guest is not told.')
  })
})

describe('which clips a filter shows', () => {
  const all = [clip('a', 'pending'), clip('b', 'approved'), clip('c', 'rejected')]
  const ids = (l: AdminVideo[]) => l.map((v) => v.id)

  test('its own clips, or every clip for All', () => {
    expect(ids(shownClips(all, 'pending', new Set()))).toEqual(['a'])
    expect(ids(shownClips(all, 'all', new Set()))).toEqual(['a', 'b', 'c'])
  })

  test('a clip decided here stays in place until the filter changes', () => {
    expect(ids(shownClips(all, 'pending', new Set(['b'])))).toEqual(['a', 'b'])
  })
})

describe('where an approved clip lives', () => {
  test('its reel on the tour page, the same link the evening email gives the guest', () => {
    expect(liveClipHref(clip('x 1', 'approved'))).toBe(`/experience/${slugify(tour.title)}?clip=x%201`)
    expect(liveClipHref(clip('a', 'approved', { experience_id: -1 }))).toBeNull()
    expect(tourTitle(-1)).toBe('Tour -1')
  })
})

describe('the queue as it first renders', () => {
  const noop = async () => true

  test('the rules first, the waiting count, the Waiting filter, only waiting clips, and no clip loaded yet', () => {
    const html = renderToStaticMarkup(<VideoQueue videos={[clip('a', 'pending', { caption: 'What a day' }), clip('b', 'approved')]} loading={false} refresh={() => {}} moderate={noop} />)
    expect(html).toContain('Every 5 approved clips earn the guest 5% off their next tour.')
    expect(html).toContain('1 clip is waiting for review.')
    expect(html).toMatch(/aria-label="Waiting, 1 clip"[^>]*checked/)
    expect(html).toContain('id="clip-a"')
    expect(html).not.toContain('id="clip-b"')
    expect(html).toContain('By Ana Example')
    expect(html).toContain('Note for the guest')
    expect(html).toContain(`aria-label="Approve, clip from Ana Example on ${tour.title.replace(/'/g, '&#x27;')}" aria-pressed="false"`)
    // Sources arrive only as a clip nears the screen.
    expect(html).not.toContain('<source')
  })

  test('loading, then all caught up', () => {
    expect(renderToStaticMarkup(<VideoQueue videos={[]} loading refresh={() => {}} moderate={noop} />)).toContain('Loading clips…')
    expect(renderToStaticMarkup(<VideoQueue videos={[clip('b', 'approved')]} loading={false} refresh={() => {}} moderate={noop} />)).toContain('All caught up. Nothing is waiting for review.')
  })
})
