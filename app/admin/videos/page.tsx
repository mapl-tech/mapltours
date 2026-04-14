'use client'

/**
 * /admin/videos — Moderation queue for user-submitted tour videos.
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
import { Check, X, Flag, ArrowLeft } from 'lucide-react'

const FILTERS: { id: VideoStatus | 'all'; label: string }[] = [
  { id: 'pending',  label: 'Pending'  },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'flagged',  label: 'Flagged'  },
  { id: 'all',      label: 'All'      },
]

export default function AdminVideosPage() {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const [filter, setFilter] = useState<VideoStatus | 'all'>('pending')
  const { videos, loading, refresh } = useAdminVideoQueue(filter)

  if (authLoading || adminLoading) {
    return <Shell><p style={{ color: 'var(--text-tertiary)' }}>Checking access…</p></Shell>
  }
  if (!user) {
    return <Shell><p>You need to sign in to view moderation. <Link href="/login?redirect=/admin/videos">Sign in →</Link></p></Shell>
  }
  if (!isAdmin) {
    return (
      <Shell>
        <p style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
          Not authorised
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)' }}>
          Ask an admin to add your account to the <code>admins</code> table.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-tertiary)', marginBottom: 6,
          }}>
            Admin · Moderation
          </p>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28,
            letterSpacing: '-0.02em', color: 'var(--text-primary)',
          }}>
            Guest tour videos
          </h1>
        </div>
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 9999,
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text-primary)', textDecoration: 'none',
          fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 600,
        }}>
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '8px 14px', borderRadius: 9999,
              border: '1px solid',
              borderColor: filter === f.id ? 'transparent' : 'var(--border)',
              background: filter === f.id ? 'var(--text-primary)' : 'var(--bg)',
              color: filter === f.id ? 'var(--bg)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, fontWeight: 600,
              letterSpacing: '-0.005em',
              transition: 'all 0.15s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : videos.length === 0 ? (
        <p style={{
          padding: '40px 16px', textAlign: 'center',
          fontFamily: 'var(--font-dm-sans)',
          color: 'var(--text-tertiary)',
          border: '1px dashed var(--border)', borderRadius: 14,
        }}>
          Nothing in the <strong>{filter}</strong> queue.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
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
    [video.experience_id]
  )

  const run = async (next: VideoStatus) => {
    setBusy(next)
    const ok = await moderateVideo(video.id, next, notes.trim() || undefined)
    setBusy(null)
    if (ok) onChanged()
  }

  return (
    <article style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      <div style={{ aspectRatio: '9 / 16', background: '#000' }}>
        <video
          src={video.video_url}
          poster={video.thumbnail_url ?? undefined}
          controls muted playsInline preload="metadata"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{
            fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 14,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>
            @{video.uploader_name || 'guest'}
          </p>
          <StatusPill status={video.status} />
        </div>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 12.5,
          color: 'var(--text-secondary)', lineHeight: 1.45,
        }}>
          {experience?.title ?? `Experience #${video.experience_id}`}
        </p>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
          color: 'var(--text-tertiary)',
        }}>
          {new Date(video.created_at).toLocaleString()}
          {video.duration_seconds ? ` · ${video.duration_seconds}s` : ''}
        </p>
        {video.caption && (
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 12.5,
            color: 'var(--text-primary)',
            background: 'var(--bg-warm)',
            padding: '8px 10px', borderRadius: 8,
            lineHeight: 1.45,
          }}>
            {video.caption}
          </p>
        )}

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes (shown on reject)"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-warm)',
            fontFamily: 'var(--font-dm-sans)', fontSize: 12,
            resize: 'none', outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <ActionBtn
            variant="approve"
            onClick={() => run('approved')}
            disabled={busy !== null || video.status === 'approved'}
          >
            <Check size={14} strokeWidth={2.5} />
            {busy === 'approved' ? '…' : 'Approve'}
          </ActionBtn>
          <ActionBtn
            variant="reject"
            onClick={() => run('rejected')}
            disabled={busy !== null || video.status === 'rejected'}
          >
            <X size={14} strokeWidth={2.5} />
            {busy === 'rejected' ? '…' : 'Reject'}
          </ActionBtn>
          <ActionBtn
            variant="flag"
            onClick={() => run('flagged')}
            disabled={busy !== null || video.status === 'flagged'}
          >
            <Flag size={13} />
            {busy === 'flagged' ? '…' : 'Flag'}
          </ActionBtn>
        </div>
      </div>
    </article>
  )
}

function StatusPill({ status }: { status: VideoStatus }) {
  const tone =
    status === 'approved' ? { bg: 'rgba(0,165,80,0.12)',  fg: 'var(--emerald, #00A550)' } :
    status === 'rejected' ? { bg: 'rgba(255,90,54,0.12)', fg: 'var(--coral, #FF5A36)'  } :
    status === 'flagged'  ? { bg: 'rgba(255,179,0,0.15)', fg: 'var(--gold, #FFB300)'   } :
                            { bg: 'rgba(0,0,0,0.06)',     fg: 'var(--text-secondary)'  }
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 9999,
      fontSize: 10.5, fontWeight: 700,
      fontFamily: 'var(--font-dm-sans)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: tone.bg, color: tone.fg,
    }}>
      {status}
    </span>
  )
}

function ActionBtn({
  variant, onClick, disabled, children,
}: {
  variant: 'approve' | 'reject' | 'flag'
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const tone = {
    approve: { bg: 'var(--emerald, #00A550)', fg: '#fff' },
    reject:  { bg: 'var(--coral, #FF5A36)',   fg: '#fff' },
    flag:    { bg: 'var(--gold, #FFB300)',    fg: '#111' },
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '8px 10px', borderRadius: 9,
        background: disabled ? 'rgba(0,0,0,0.06)' : tone.bg,
        color: disabled ? 'var(--text-tertiary)' : tone.fg,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 12,
      }}
    >
      {children}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-warm, #FAF8F3)',
      padding: '32px 20px 60px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  )
}
