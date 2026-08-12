'use client'

/**
 * /admin/videos - moderation queue for user-submitted tour videos.
 *
 * Access is gated by the `admins` allowlist (see migration 003). The RLS
 * policies let admins read every row; non-admins hit a "Not authorised" wall.
 * Approving a video triggers the DB function that may unlock a 5%-off reward.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  useAdminVideoQueue,
  useIsAdmin,
  moderateVideo,
  type AdminVideo,
  type VideoStatus,
} from '@/lib/tour-videos'
import { experiences } from '@/lib/experiences'
import { useAuth } from '@/lib/supabase/auth-context'
import { Check, X, Flag, Clock } from 'lucide-react'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = '#6E6A62' // AA-passing tertiary (5.38:1 on white)
const green = '#1D7A50'
const border = '1px solid var(--border, #E7E1D6)'

const FILTERS: { id: VideoStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'all', label: 'All' },
]

export default function AdminVideosPage() {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const [filter, setFilter] = useState<VideoStatus | 'all'>('pending')
  // Fetch the whole recent queue once so the chips can show live per-status
  // counts and filtering is instant (no refetch per tab).
  const { videos: all, loading, refresh } = useAdminVideoQueue('all')

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, flagged: 0, all: all.length }
    for (const v of all) c[v.status] = (c[v.status] ?? 0) + 1
    return c
  }, [all])

  const videos = useMemo(
    () => (filter === 'all' ? all : all.filter((v) => v.status === filter)),
    [all, filter],
  )

  if (authLoading || adminLoading) {
    return <Shell><p style={{ color: faint }}>Checking access…</p></Shell>
  }
  if (!user) {
    return <Shell><p style={{ color: soft }}>You need to sign in to view moderation. <Link href="/login?redirect=/admin/videos" style={{ color: ink, fontWeight: 600 }}>Sign in →</Link></p></Shell>
  }
  if (!isAdmin) {
    return (
      <Shell>
        <p style={{ fontFamily: dm, fontWeight: 700, fontSize: 20, marginBottom: 8, color: ink }}>Not authorised</p>
        <p style={{ fontFamily: dm, color: soft }}>Ask an admin to add your account to the <code>admins</code> table.</p>
      </Shell>
    )
  }

  const pending = counts.pending ?? 0

  return (
    <Shell>
      {/* Header - consistent with the bookings dashboard */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: dm, fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', color: ink, margin: 0 }}>
            Video moderation
          </h1>
          <Link href="/admin/bookings" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>← Bookings</Link>
        </div>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px',
            borderRadius: 9999, border, background: '#fff', color: ink,
            fontFamily: dm, fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >
          <span aria-hidden="true">←</span> Back to website
        </Link>
      </div>

      {/* At-a-glance line: what needs the moderator now */}
      <p style={{ marginTop: 10, fontSize: 14, color: soft, fontFamily: dm, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Clock size={15} color={pending > 0 ? '#B8873D' : green} />
        {pending > 0
          ? <span><strong style={{ color: ink }}>{pending}</strong> {pending === 1 ? 'video is' : 'videos are'} waiting for review.</span>
          : <span>All caught up. Nothing is waiting for review. 🇯🇲</span>}
      </p>

      {/* Filter chips with live counts */}
      <div role="tablist" aria-label="Filter videos by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        {FILTERS.map((f) => {
          const active = filter === f.id
          const n = counts[f.id] ?? 0
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px',
                borderRadius: 9999, cursor: 'pointer',
                border: active ? '1px solid transparent' : border,
                background: active ? ink : '#fff',
                color: active ? '#fff' : soft,
                fontFamily: dm, fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em',
                transition: 'all 0.15s ease',
              }}
            >
              {f.label}
              <span style={{
                fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700,
                padding: '1px 8px', borderRadius: 9999,
                background: active ? 'rgba(255,255,255,0.22)' : 'var(--surface, #F1ECE3)',
                color: active ? '#fff' : faint,
              }}>{n}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ fontFamily: dm, color: faint, marginTop: 24 }}>Loading…</p>
      ) : videos.length === 0 ? (
        <p style={{
          marginTop: 20, padding: '48px 16px', textAlign: 'center',
          fontFamily: dm, color: faint,
          border: '1px dashed var(--border, #E7E1D6)', borderRadius: 14,
        }}>
          Nothing in the <strong style={{ color: soft }}>{filter}</strong> queue.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16, marginTop: 22,
        }}>
          {videos.map((v) => (
            <ModerationCard key={v.id} video={v} onChanged={refresh} />
          ))}
        </div>
      )}
    </Shell>
  )
}

function ModerationCard({ video, onChanged }: { video: AdminVideo; onChanged: () => void }) {
  const [notes, setNotes] = useState(video.admin_notes ?? '')
  const [busy, setBusy] = useState<null | VideoStatus>(null)
  const experience = useMemo(
    () => experiences.find((e) => e.id === video.experience_id),
    [video.experience_id],
  )

  const run = async (next: VideoStatus) => {
    setBusy(next)
    const ok = await moderateVideo(video.id, next, notes.trim() || undefined)
    setBusy(null)
    if (ok) onChanged()
  }

  return (
    <article style={{
      background: '#fff',
      border,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ aspectRatio: '9 / 16', background: '#000', position: 'relative' }}>
        <video
          src={video.video_url}
          poster={video.thumbnail_url ?? undefined}
          controls muted playsInline preload="metadata"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <StatusPill status={video.status} />
        </div>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: dm, fontWeight: 700, fontSize: 14, color: ink, letterSpacing: '-0.01em' }}>
          @{video.uploader_name || 'guest'}
        </p>
        <p style={{ fontFamily: dm, fontSize: 12.5, color: soft, lineHeight: 1.45 }}>
          {experience?.title ?? `Experience #${video.experience_id}`}
        </p>
        <p style={{ fontFamily: dm, fontSize: 11.5, color: faint }}>
          {new Date(video.created_at).toLocaleString()}
          {video.duration_seconds ? ` · ${video.duration_seconds}s` : ''}
        </p>
        {video.caption && (
          <p style={{
            fontFamily: dm, fontSize: 12.5, color: ink,
            background: 'var(--bg-warm, #F4F1EB)', padding: '8px 10px', borderRadius: 8, lineHeight: 1.45,
          }}>
            {video.caption}
          </p>
        )}

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes (shown to the uploader on reject)"
          aria-label="Internal moderation notes"
          rows={2}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            border, background: 'var(--bg-warm, #F4F1EB)',
            fontFamily: dm, fontSize: 12, color: ink,
            resize: 'none', outline: 'none', boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <ActionBtn variant="approve" onClick={() => run('approved')} disabled={busy !== null || video.status === 'approved'}>
            <Check size={14} strokeWidth={2.5} />{busy === 'approved' ? '…' : 'Approve'}
          </ActionBtn>
          <ActionBtn variant="reject" onClick={() => run('rejected')} disabled={busy !== null || video.status === 'rejected'}>
            <X size={14} strokeWidth={2.5} />{busy === 'rejected' ? '…' : 'Reject'}
          </ActionBtn>
          <ActionBtn variant="flag" onClick={() => run('flagged')} disabled={busy !== null || video.status === 'flagged'}>
            <Flag size={13} />{busy === 'flagged' ? '…' : 'Flag'}
          </ActionBtn>
        </div>
      </div>
    </article>
  )
}

function StatusPill({ status }: { status: VideoStatus }) {
  const tone =
    status === 'approved' ? { bg: 'rgba(29,122,80,0.16)', fg: '#12603C' } :
    status === 'rejected' ? { bg: 'rgba(200,40,20,0.16)', fg: '#B01C0C' } :
    status === 'flagged' ? { bg: 'rgba(184,135,58,0.18)', fg: '#7A5A08' } :
                           { bg: 'rgba(255,255,255,0.9)', fg: '#3A3833' }
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: 9999,
      fontSize: 11, fontWeight: 700, fontFamily: dm,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: tone.bg, color: tone.fg,
      backdropFilter: 'blur(6px)',
    }}>
      {status}
    </span>
  )
}

function ActionBtn({ variant, onClick, disabled, children }: {
  variant: 'approve' | 'reject' | 'flag'
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  // Approve is the primary action (filled green); reject/flag are lower-weight
  // outlined buttons so the common decision reads first (Hick's law).
  const tone = {
    approve: { bg: green, fg: '#fff', bd: green },
    reject: { bg: '#fff', fg: '#B01C0C', bd: 'rgba(176,28,12,0.4)' },
    flag: { bg: '#fff', fg: '#7A5A08', bd: 'rgba(122,90,8,0.4)' },
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: variant === 'approve' ? 1.4 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        minHeight: 40, padding: '0 10px', borderRadius: 10,
        background: disabled ? 'var(--surface, #F1ECE3)' : tone.bg,
        color: disabled ? faint : tone.fg,
        border: `1px solid ${disabled ? 'var(--border, #E7E1D6)' : tone.bd}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: dm, fontWeight: 700, fontSize: 12.5,
      }}
    >
      {children}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm, #F4F1EB)' }}>
      <div className="container" style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px 90px' }}>
        {children}
      </div>
    </div>
  )
}
