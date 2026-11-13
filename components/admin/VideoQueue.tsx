'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag, X } from 'lucide-react'
import type { AdminVideo, VideoStatus } from '@/lib/tour-videos'
import { experiences, HEVC_SOURCE_TYPE, slugify } from '@/lib/experiences'
import Arrow from '@/components/ui/Arrow'
import { VIDEO_REWARD_MILESTONE } from '@/lib/video-rules'
import { stamp } from '@/lib/admin-format'
import Segmented from '@/components/admin/Segmented'
import { useResultNote, type Note } from '@/components/admin/AdminUi'

/**
 * The guest clip queue (/admin/videos), Nov 13 2026 redesign on the shared
 * .adm system. app/admin/videos/page.tsx checks the session and feeds it.
 *
 * What a decision does is stated where it is made: Approve publishes the
 * clip on its tour and counts toward the guest's reward (migration 003's
 * trigger, never taken back); Reject keeps it off the site and the note goes
 * to the guest in the evening email (lib/clip-digest); Flag hides it and the
 * guest is told nothing. The three buttons never move: the current decision
 * shows as pressed, and a decided card stays where it is until the filter
 * changes, so the next clip never slides under the pointer. The request
 * (moderateVideo) is unchanged. Styles: the .adm-vid block in app/globals.css.
 */

type Filter = VideoStatus | 'all'
type Decision = Exclude<VideoStatus, 'pending'>

const STATUS: Record<VideoStatus, { cls: string; label: string }> = {
  pending: { cls: 'adm-badge--warn', label: 'Waiting' },
  approved: { cls: 'adm-badge--ok', label: 'Approved' },
  rejected: { cls: 'adm-badge--bad', label: 'Rejected' },
  flagged: { cls: 'adm-badge--plain', label: 'Flagged' },
}

export function tourTitle(id: number): string {
  return experiences.find((e) => e.id === id)?.title ?? `Tour ${id}`
}

/** What the owner is told after a decision lands. Exported for tests/unit/video-queue.spec.tsx. */
export function decisionNote(next: Decision, v: Pick<AdminVideo, 'experience_id' | 'uploader_name'>, note: string): Note {
  const who = v.uploader_name || 'the guest'
  if (next === 'approved') return { text: `Approved. It is on the ${tourTitle(v.experience_id)} page now.` }
  if (next === 'rejected') return { text: note ? `Rejected. ${who} gets your note in this evening's email.` : `Rejected. It stays off the site; this evening's email tells ${who}.` }
  return { text: 'Flagged. It is hidden, and the guest is not told.' }
}

/** Where guests see an approved clip: its reel on the tour page, the same link the evening email gives them. */
export function liveClipHref(v: Pick<AdminVideo, 'id' | 'experience_id'>): string | null {
  const exp = experiences.find((e) => e.id === v.experience_id)
  return exp ? `/experience/${slugify(exp.title)}?clip=${encodeURIComponent(v.id)}` : null
}

/** True once the element is within `margin` of the screen (always true without IntersectionObserver). */
function useNear<T extends Element>(margin = '800px') {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect() }
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [near, margin])
  return { ref, near }
}

/** Which clips a filter shows: its own, plus any decided here since the filter was chosen (they stay put). */
export function shownClips(all: AdminVideo[], filter: Filter, pinned: ReadonlySet<string>): AdminVideo[] {
  return filter === 'all' ? all : all.filter((v) => v.status === filter || pinned.has(v.id))
}

export default function VideoQueue({ videos, loading, refresh, moderate }: {
  videos: AdminVideo[]
  loading: boolean
  refresh: () => unknown
  moderate: (id: string, next: VideoStatus, notes?: string) => Promise<boolean>
}) {
  const [filter, setFilter] = useState<Filter>('pending')
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const { setNote, keepClear, toast } = useResultNote()
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, flagged: 0, all: videos.length }
    for (const v of videos) c[v.status] = (c[v.status] ?? 0) + 1
    return c
  }, [videos])
  const shown = shownClips(videos, filter, pinned)
  const waiting = counts.pending ?? 0

  function choose(f: Filter) { setPinned(new Set()); setFilter(f) }

  // The new-clip email links here with ?clip=<id>: once the queue loads, that
  // clip's filter opens and the clip is brought into view, outlined, and its
  // heading takes focus. Once only, so reviewing never jumps the page.
  const [target, setTarget] = useState<string | null>(null)
  const done = useRef(false)
  const focusTarget = useRef<string | null>(null)
  useEffect(() => { setTarget(new URLSearchParams(window.location.search).get('clip')) }, [])
  const targetStatus = target ? videos.find((v) => v.id === target)?.status : undefined
  useEffect(() => {
    if (!targetStatus || done.current) return
    done.current = true
    focusTarget.current = `clip-${target}-h`
    setPinned(new Set()); setFilter(targetStatus)
  }, [target, targetStatus])
  // After the commit that shows it (the filter switch renders the card first).
  useEffect(() => {
    if (!focusTarget.current) return
    const h = document.getElementById(focusTarget.current)
    if (!h) return
    focusTarget.current = null
    h.closest('li')?.scrollIntoView({ block: 'center' })
    h.focus({ preventScroll: true })
  })

  async function decide(v: AdminVideo, next: Decision, note: string): Promise<boolean> {
    const ok = await moderate(v.id, next, note || undefined)
    if (!ok) { setNote({ text: 'That did not save. Check the connection and try again.', bad: true }); return false }
    setPinned((p) => new Set(p).add(v.id))
    setNote(decisionNote(next, v, note))
    await refresh()
    return true
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'pending', label: 'Waiting', count: counts.pending ?? 0 },
    { key: 'approved', label: 'Approved', count: counts.approved ?? 0 },
    { key: 'rejected', label: 'Rejected', count: counts.rejected ?? 0 },
    { key: 'flagged', label: 'Flagged', count: counts.flagged ?? 0 },
    { key: 'all', label: 'All', count: videos.length },
  ]

  return (
    <div className="adm" onFocus={keepClear}>
      <h1 className="adm-h1">Videos</h1>
      <p className="adm-lead">Clips guests post from their trips wait here for your decision.</p>
      <dl className="adm-vid-rules">
        <div><dt>Approve</dt><dd>It goes on the tour&rsquo;s page at once. Every {VIDEO_REWARD_MILESTONE} approved clips earn the guest 5% off their next tour.</dd></div>
        <div><dt>Reject</dt><dd>It stays off the site, and your note goes to the guest in the evening email.</dd></div>
        <div><dt>Flag</dt><dd>It is hidden, and the guest is not told.</dd></div>
      </dl>

      <p className={waiting ? 'adm-vid-waiting adm-vid-waiting--on' : 'adm-vid-waiting'}>
        {loading && videos.length === 0 ? 'Loading clips…'
          : waiting ? <><strong>{waiting === 1 ? '1 clip is' : `${waiting} clips are`} waiting for review.</strong></>
          : 'All caught up. Nothing is waiting for review. 🇯🇲'}
      </p>

      <div className="adm-vid-filter">
        <Segmented label="Show clips" value={filter} onChange={choose} options={FILTERS} unit="clip" grid />
      </div>

      {!(loading && videos.length === 0) && shown.length === 0 && (
        <p className="adm-empty">{filter === 'pending' ? 'Nothing is waiting. New clips arrive here as guests post them.' : filter === 'all' ? 'No clips yet.' : `No ${STATUS[filter as VideoStatus].label.toLowerCase()} clips.`}</p>
      )}

      <ol className="adm-vid-grid">
        {shown.map((v) => <ClipCard key={v.id} v={v} isTarget={v.id === target} decide={decide} />)}
      </ol>

      {toast}
    </div>
  )
}

function ClipCard({ v, isTarget, decide }: { v: AdminVideo; isTarget: boolean; decide: (v: AdminVideo, next: Decision, note: string) => Promise<boolean> }) {
  const [note, setNote] = useState(v.admin_notes ?? '')
  const [busy, setBusy] = useState<Decision | null>(null)
  const tour = tourTitle(v.experience_id)
  const who = v.uploader_name || 'a guest'
  const id = v.id
  const live = v.status === 'approved' ? liveClipHref(v) : null
  // A long queue loads each clip only as it comes near the screen.
  const { ref: mediaRef, near } = useNear<HTMLDivElement>()

  async function run(next: Decision) {
    if (busy || v.status === next) return
    setBusy(next)
    try { await decide(v, next, note.trim()) } finally { setBusy(null) }
  }

  const button = (next: Decision, label: string, done: string, Icon: typeof Check, tone: string) => {
    const on = v.status === next
    const text = busy === next ? 'Saving…' : on ? done : label
    return (
      <button type="button" className={`adm-btn adm-btn--sm adm-vid-btn adm-vid-btn--${tone}${on ? ' is-on' : ''}`}
        aria-label={`${text}, clip from ${who} on ${tour}`}
        aria-pressed={on} aria-disabled={(!on && busy !== null) || undefined} aria-busy={busy === next || undefined} onClick={() => void run(next)}>
        <Icon size={16} strokeWidth={2.5} aria-hidden />
        {text}
      </button>
    )
  }

  return (
    <li id={`clip-${id}`} className={`adm-card adm-vid${v.status === 'pending' ? ' is-pending' : ''}${isTarget ? ' is-target' : ''}`}>
      <div ref={mediaRef} className="adm-vid-media">
        <video controls muted playsInline preload="metadata" poster={v.thumbnail_url ?? undefined}
          aria-label={`Clip from ${who} on ${tour}${v.duration_seconds ? `, ${v.duration_seconds} seconds` : ''}`}>
          {/* As guests see it: the phone copies first (missing ones fail over), the upload last. */}
          {near && (
            <>
              {v.video_hevc_url && <source src={v.video_hevc_url} type={HEVC_SOURCE_TYPE} />}
              {v.video_m_url && <source src={v.video_m_url} type="video/mp4" />}
              <source src={v.video_url} />
            </>
          )}
        </video>
        {/* Over the clip, so approving adds no line and nothing below moves. */}
        {live && (
          <a className="adm-vid-live" href={live} target="_blank" rel="noopener noreferrer">
            On the tour page<Arrow /><span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      <div className="adm-card-in">
        <div className="adm-vid-head">
          <h2 id={`clip-${id}-h`} tabIndex={-1} className="adm-vid-h">{tour}</h2>
          <span className={`adm-badge ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
        </div>
        <p className="adm-meta">By {who} <span aria-hidden="true">·</span> <span className="adm-nowrap">{stamp(v.created_at)}</span>{v.duration_seconds ? <> <span aria-hidden="true">·</span> {v.duration_seconds} s</> : null}</p>
        {v.caption && (
          <figure className="adm-quote">
            <blockquote><p>{v.caption}</p></blockquote>
            <figcaption>Their caption</figcaption>
          </figure>
        )}
        <div>
          <label className="adm-label" htmlFor={`note-${id}`}>Note for the guest</label>
          {/* A rejected clip's note has gone (or goes tonight) as it was: shown, not editable, same size. */}
          <textarea id={`note-${id}`} className="adm-input adm-textarea adm-vid-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            readOnly={v.status === 'rejected'} aria-describedby={`note-${id}-help`} />
          <p id={`note-${id}-help`} className="adm-help">Sent in the evening email only if you reject the clip.</p>
        </div>
        <div className="adm-actions adm-vid-actions" role="group" aria-label={`Decision for the clip from ${who}`}>
          {button('approved', 'Approve', 'Approved', Check, 'ok')}
          {button('rejected', 'Reject', 'Rejected', X, 'bad')}
          {button('flagged', 'Flag', 'Flagged', Flag, 'plain')}
        </div>
      </div>
    </li>
  )
}
