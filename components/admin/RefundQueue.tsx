'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Approve or decline pending refund requests.
 *
 * Every decision goes through /api/admin/refunds/[id], which re-checks the
 * admin allowlist server-side — this component is convenience, never the
 * security boundary.
 *
 * Approving moves real money, so it asks for confirmation and shows the exact
 * figure on the button. Declining asks for a reason, which is emailed to the
 * traveler verbatim.
 */

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const line = 'var(--border, #E7E1D6)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`
const shortRef = (id: string) => 'MAPL-' + id.slice(0, 8).toUpperCase()

function when(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return iso }
}

function Badge({ state }: { state: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    requested: { bg: '#FEF0C7', fg: '#7A5B00', label: 'Awaiting decision' },
    approved: { bg: '#D1FADF', fg: '#05603A', label: 'Approved & refunded' },
    declined: { bg: '#FEE4E2', fg: '#912018', label: 'Declined' },
  }
  const v = map[state] ?? { bg: '#EEE', fg: '#444', label: state }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 9999,
      background: v.bg, color: v.fg, fontSize: 11.5, fontWeight: 700, fontFamily: dm,
    }}>
      {v.label}
    </span>
  )
}

function RequestCard({ row, onDone }: { row: Row; onDone: () => void }) {
  const [busy, setBusy] = useState<null | 'approve' | 'decline'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<null | 'approve' | 'decline'>(null)
  const [reason, setReason] = useState('')

  const pending = row.refund_state === 'requested'
  const quoted = Number(row.refund_quoted_amount ?? 0)

  async function decide(action: 'approve' | 'decline') {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/admin/refunds/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'decline' ? reason : undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? body.error ?? 'Something went wrong.')
        return
      }
      onDone()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{
      background: '#fff', border: `1px solid ${line}`, borderRadius: 14,
      padding: '18px 20px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, fontFamily: dm }}>
            {shortRef(row.id)} · {[row.first_name, row.last_name].filter(Boolean).join(' ') || 'Traveler'}
          </p>
          <p style={{ color: soft, fontSize: 13, marginTop: 3 }}>
            {row.email ?? 'no email'}{row.phone ? ` · ${row.phone}` : ''}
            {' · '}{row.booking_type === 'transfer' ? 'Transfer' : 'Tour'}
          </p>
          <p style={{ color: soft, fontSize: 12.5, marginTop: 3 }}>
            Requested {when(row.refund_requested_at)}
            {row.refund_decided_at ? ` · decided ${when(row.refund_decided_at)}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Badge state={row.refund_state} />
          <p style={{ fontWeight: 800, fontSize: 20, marginTop: 8, fontFamily: dm }}>
            {money(pending ? quoted : row.refund_amount ?? quoted)}
          </p>
          <p style={{ color: soft, fontSize: 12 }}>
            of {money(row.total_paid)} paid
          </p>
        </div>
      </div>

      {(row.booking_items ?? []).length > 0 && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', borderTop: `1px solid ${line}`, paddingTop: 10 }}>
          {(row.booking_items as Row[]).map((i, n) => (
            <li key={n} style={{ fontSize: 13, color: soft, marginTop: n ? 4 : 0 }}>
              {i.title ?? `Transfer to ${i.hotel ?? i.destination ?? 'hotel'}`}
              {i.date ? ` · ${i.date}` : ''}
              {i.arrival_at ? ` · ${when(i.arrival_at)}` : ''}
            </li>
          ))}
        </ul>
      )}

      {row.refund_decline_reason && (
        <p style={{ marginTop: 10, fontSize: 13, color: soft }}>
          Reason given: {row.refund_decline_reason}
        </p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 10, fontSize: 13, color: '#912018', fontWeight: 600 }}>{error}</p>
      )}

      {pending && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${line}`, paddingTop: 14 }}>
          {confirming === 'decline' && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (emailed to the traveler, optional)"
              rows={2}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${line}`,
                fontFamily: dm, fontSize: 13, marginBottom: 10, resize: 'vertical',
              }}
            />
          )}
          {confirming === 'approve' && (
            <p style={{ fontSize: 13, color: ink, marginBottom: 10, fontWeight: 600 }}>
              This sends {money(quoted)} back to the traveler&rsquo;s card and cancels the
              trip. It cannot be undone.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {confirming === null && (
              <>
                <button type="button" onClick={() => setConfirming('approve')} style={btn(ink, '#fff')}>
                  Approve refund
                </button>
                <button type="button" onClick={() => setConfirming('decline')} style={btn('transparent', ink, line)}>
                  Decline
                </button>
              </>
            )}
            {confirming !== null && (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => decide(confirming)}
                  style={{ ...btn(confirming === 'approve' ? '#05603A' : '#912018', '#fff'), opacity: busy ? 0.6 : 1 }}
                >
                  {busy
                    ? 'Working…'
                    : confirming === 'approve' ? `Yes, refund ${money(quoted)}` : 'Yes, decline'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => { setConfirming(null); setError(null) }}
                  style={btn('transparent', soft, line)}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function btn(bg: string, fg: string, border?: string): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9999,
    background: bg, color: fg,
    border: border ? `1px solid ${border}` : 'none',
    fontFamily: dm, fontWeight: 700, fontSize: 13, cursor: 'pointer',
  }
}

export default function RefundQueue({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const pending = rows.filter((r) => r.refund_state === 'requested')
  const decided = rows.filter((r) => r.refund_state !== 'requested')

  return (
    <>
      <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>
        Refunds
      </h1>
      <p style={{ marginTop: 8, color: soft, fontSize: 14, maxWidth: 620 }}>
        Travelers request a cancellation; no money moves until someone here approves it.
        Approving refunds the amount quoted when they asked, which is honoured even if
        the 48-hour window has since closed.
      </p>

      <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 16, margin: '28px 0 12px' }}>
        Awaiting decision ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p style={{ color: soft, fontSize: 14 }}>Nothing waiting. </p>
      ) : (
        pending.map((r) => <RequestCard key={r.id} row={r} onDone={() => router.refresh()} />)
      )}

      {decided.length > 0 && (
        <>
          <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 16, margin: '32px 0 12px' }}>
            Decided ({decided.length})
          </h2>
          {decided.map((r) => <RequestCard key={r.id} row={r} onDone={() => router.refresh()} />)}
        </>
      )}
    </>
  )
}
