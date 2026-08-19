'use client'

import { useState } from 'react'

/**
 * Gift-card support desk.
 *
 * Built around the questions support actually gets asked, in order of how
 * often they come up: "it never arrived", "I sent it to the wrong address",
 * "how much is left on it", "cancel it".
 */

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'

interface Card {
  id: string
  code: string
  initial_amount: number | string
  balance: number | string
  currency: string
  status: string
  purchaser_name: string | null
  purchaser_email: string | null
  recipient_name: string | null
  recipient_email: string
  message: string | null
  created_at: string
  paid_at: string | null
  delivered_at: string | null
  expires_at: string | null
  stripe_payment_id: string | null
}

const STATUS_COLOR: Record<string, string> = {
  active: '#0F7B4F',
  pending: '#9A6B00',
  depleted: '#57534C',
  void: '#B3261E',
}

function money(n: number | string, currency = 'USD') {
  const v = Number(n)
  return `${currency === 'USD' ? '$' : currency + ' '}${(Number.isFinite(v) ? v : 0).toFixed(2)}`
}

function when(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}

export default function GiftCardDesk() {
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<Card[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setNote(null)
    try {
      const res = await fetch(`/api/admin/gift-cards?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setCards(data.cards ?? [])
    } catch {
      setNote('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function act(id: string, action: string, email?: string) {
    setBusy(id + action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNote(data.error ?? 'That did not work.')
        return
      }
      setNote(
        action === 'resend' ? 'Card re-sent.'
        : action === 'correct_email' ? `Address corrected to ${data.recipientEmail}, card re-sent.`
        : action === 'void' ? 'Card voided. It can no longer be spent.'
        : 'Card reactivated.',
      )
      setEditing(null)
      setNewEmail('')
      await search()
    } catch {
      setNote('That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>
        Gift cards
      </h1>
      <p style={{ marginTop: 8, color: soft, fontSize: 14, maxWidth: 620, lineHeight: 1.6 }}>
        Look up a card by its code, the recipient&rsquo;s email, or the buyer&rsquo;s email. A gift
        code is a bearer instrument &mdash; anyone holding it can spend the balance, so treat what
        you see here as you would a card number.
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginTop: 20, maxWidth: 560 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="MAPL-XXXX-XXXX or an email address"
          aria-label="Search gift cards"
          style={{
            flex: 1, height: 42, borderRadius: 10, padding: '0 14px',
            border: '1px solid rgba(0,0,0,0.14)', fontFamily: dm, fontSize: 14,
            color: ink, background: '#fff', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          style={{
            height: 42, padding: '0 22px', borderRadius: 10, border: 'none',
            background: ink, color: '#fff', fontFamily: dm, fontWeight: 600, fontSize: 14,
            cursor: loading || !q.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !q.trim() ? 0.5 : 1,
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {note && (
        <p style={{ marginTop: 14, fontSize: 14, color: ink, fontFamily: dm, fontWeight: 600 }}>
          {note}
        </p>
      )}

      {cards && cards.length === 0 && (
        <p style={{ marginTop: 24, color: soft, fontSize: 14 }}>
          Nothing matched that. Codes look like <code>MAPL-XXXX-XXXX</code>; emails match either side.
        </p>
      )}

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(cards ?? []).map((c) => (
          <div
            key={c.id}
            style={{
              background: '#fff', borderRadius: 14, padding: '18px 20px',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontFamily: dm, fontWeight: 800, fontSize: 18, letterSpacing: '0.06em' }}>
                {c.code}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: STATUS_COLOR[c.status] ?? soft,
              }}>
                {c.status}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: dm, fontWeight: 700, fontSize: 16 }}>
                {money(c.balance, c.currency)} left
                <span style={{ color: soft, fontWeight: 500, fontSize: 13 }}>
                  {' '}of {money(c.initial_amount, c.currency)}
                </span>
              </span>
            </div>

            <div style={{
              marginTop: 14, display: 'grid', gap: '6px 24px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              fontSize: 13, color: soft, lineHeight: 1.5,
            }}>
              <div>To <strong style={{ color: ink }}>{c.recipient_email}</strong>{c.recipient_name ? ` (${c.recipient_name})` : ''}</div>
              <div>From <strong style={{ color: ink }}>{c.purchaser_email ?? '—'}</strong>{c.purchaser_name ? ` (${c.purchaser_name})` : ''}</div>
              <div>Bought {when(c.created_at)}</div>
              <div>Paid {when(c.paid_at)}</div>
              <div>
                Delivered {when(c.delivered_at)}
                {!c.delivered_at && c.status === 'active' && (
                  <strong style={{ color: '#B3261E' }}>, never sent</strong>
                )}
              </div>
              <div>Expires {when(c.expires_at)}</div>
            </div>

            {c.message && (
              <p style={{ marginTop: 10, fontSize: 13, color: soft, fontStyle: 'italic' }}>
                &ldquo;{c.message}&rdquo;
              </p>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Action label="Re-send" onClick={() => act(c.id, 'resend')} busy={busy === c.id + 'resend'} />
              <Action
                label={editing === c.id ? 'Cancel' : 'Fix address'}
                onClick={() => { setEditing(editing === c.id ? null : c.id); setNewEmail(c.recipient_email) }}
                busy={false}
              />
              {c.status === 'void' ? (
                <Action label="Reactivate" onClick={() => act(c.id, 'reactivate')} busy={busy === c.id + 'reactivate'} />
              ) : (
                <Action label="Void" danger onClick={() => act(c.id, 'void')} busy={busy === c.id + 'void'} />
              )}
            </div>

            {editing === c.id && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  type="email"
                  aria-label="Corrected recipient email"
                  style={{
                    flex: '1 1 260px', height: 38, borderRadius: 9, padding: '0 12px',
                    border: '1px solid rgba(0,0,0,0.14)', fontFamily: dm, fontSize: 13.5,
                    background: '#fff', color: ink, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <Action
                  label="Save & re-send"
                  onClick={() => act(c.id, 'correct_email', newEmail)}
                  busy={busy === c.id + 'correct_email'}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Action({
  label, onClick, busy, danger,
}: { label: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        height: 36, padding: '0 16px', borderRadius: 9,
        border: `1px solid ${danger ? 'rgba(179,38,30,0.35)' : 'rgba(0,0,0,0.14)'}`,
        background: '#fff', color: danger ? '#B3261E' : ink,
        fontFamily: dm, fontWeight: 600, fontSize: 13,
        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? 'Working…' : label}
    </button>
  )
}
