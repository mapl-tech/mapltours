'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { describeCoupon, type CouponRow } from '@/lib/coupons'

/**
 * Coupon desk.
 *
 * Three jobs, in the order they come up: see what is live and what has been
 * used; make a new code in under thirty seconds with no invalid state
 * possible; stop one. Every rule is spelled out in plain words on its row,
 * and the only destructive action (void) asks once, inline.
 */

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = '#6E6A62'
const border = '1px solid var(--border, #E7E1D6)'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }

interface Coupon extends CouponRow { source: string | null; note: string | null; created_at: string; updated_at: string }
interface Redemption { coupon_id: string; booking_id: string | null; email: string | null; amount: number | string; created_at: string }

type Filter = 'all' | 'active' | 'used' | 'paused' | 'expired' | 'void'

const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  active:  { bg: '#E3F3EA', fg: '#0F7B4F', label: 'Live' },
  used:    { bg: '#EEEDE9', fg: '#4E4C47', label: 'Used' },
  paused:  { bg: '#FFF1D6', fg: '#8A5A00', label: 'Paused' },
  expired: { bg: '#EEEDE9', fg: '#6E6A62', label: 'Expired' },
  void:    { bg: '#FBE4E2', fg: '#B3261E', label: 'Void' },
}

function state(c: Coupon): keyof typeof BADGE {
  if (c.status === 'void') return 'void'
  if (c.status === 'paused') return 'paused'
  if (c.expires_at && Date.parse(c.expires_at) < Date.now()) return 'expired'
  if (Number(c.uses) >= Number(c.max_uses)) return 'used'
  return 'active'
}

function when(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}
function money(n: number | string) { const v = Number(n); return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}` }
function plusDays(d: number) { const t = new Date(Date.now() + d * 86_400_000); return t.toISOString().slice(0, 10) }

const input: React.CSSProperties = {
  height: 44, borderRadius: 10, padding: '0 12px', border: '1px solid rgba(0,0,0,0.16)', fontFamily: dm, fontSize: 16,
  color: ink, background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%',
}
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: faint, marginBottom: 6, letterSpacing: '0.02em' }

export default function CouponDesk() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // The form: percent by default, one use, six months, no code (issued).
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('5')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [minTotal, setMinTotal] = useState('')
  const [expiresAt, setExpiresAt] = useState(plusDays(180))
  const [formNote, setFormNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/coupons?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) { setNote(data.error ?? 'Could not load coupons.'); return }
      setCoupons(data.coupons ?? [])
      setRedemptions(data.redemptions ?? [])
    } catch {
      setNote('Could not load coupons. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => { void load() }, [load])

  const shown = (coupons ?? []).filter((c) => filter === 'all' || state(c) === filter)
  const counts = (coupons ?? []).reduce<Record<string, number>>((m, c) => { const s = state(c); m[s] = (m[s] ?? 0) + 1; return m }, {})

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value: Number(value), code: code.trim() || undefined, email: email.trim() || undefined, maxUses: Number(maxUses), minTotal: minTotal.trim() || undefined, expiresAt: expiresAt ? `${expiresAt}T23:59:59-05:00` : undefined, note: formNote.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'That did not work.'); return }
      setNote(`Created ${data.coupon.code}: ${describeCoupon(data.coupon)}.`)
      setCode(''); setEmail(''); setFormNote('')
      await load()
    } catch {
      setFormError('That did not work. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function act(id: string, action: 'pause' | 'resume' | 'void') {
    setBusy(id + action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/coupons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const data = await res.json()
      if (!res.ok) { setNote(data.error ?? 'That did not work.'); return }
      setNote(action === 'void' ? 'Coupon voided. It can no longer be used.' : action === 'pause' ? 'Coupon paused. Resume it any time.' : 'Coupon is live again.')
      setConfirmVoid(null)
      await load()
    } catch {
      setNote('That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNote(`${text} copied.`) } catch { setNote('Could not copy. Select the code and copy it by hand.') }
  }

  const preview = describeCoupon({ kind, value: Number(value) || 0, applies_to: 'tour', max_uses: Number(maxUses) || 1, email: email.trim() || null, min_total: minTotal.trim() ? Number(minTotal) : null, expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : null })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: dm, fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', margin: 0 }}>Coupons</h1>
        <Link href="/admin/bookings" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>← Bookings</Link>
        <Link href="/admin/gift-cards" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>Gift cards →</Link>
      </div>
      <p style={{ marginTop: 8, color: soft, fontSize: 14, maxWidth: 640, lineHeight: 1.6 }}>
        A coupon takes a percent or a fixed amount off a tour at checkout. It is not money: nothing is refunded on it, and the
        booking&rsquo;s total is already net of it. The bio page issues 5% single-use codes on its own; make anything else here.
      </p>

      {/* Stat tiles */}
      <div style={{ marginTop: 22, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {(['active', 'used', 'paused', 'expired', 'void'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? 'all' : s)} aria-pressed={filter === s}
            style={{ textAlign: 'left', background: '#fff', border: filter === s ? `1px solid ${ink}` : border, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: dm, minHeight: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint }}>{BADGE[s].label}</div>
            <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', ...tnum }}>{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* Create */}
      <form onSubmit={create} style={{ marginTop: 26, background: '#fff', border, borderRadius: 14, padding: '18px 20px' }}>
        <h2 style={{ margin: 0, fontFamily: dm, fontWeight: 700, fontSize: 18 }}>New coupon</h2>
        <div style={{ marginTop: 14, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <span style={label}>Discount</span>
            <div role="group" aria-label="Discount kind" style={{ display: 'flex', gap: 0, border: '1px solid rgba(0,0,0,0.16)', borderRadius: 10, overflow: 'hidden', height: 44 }}>
              {(['percent', 'fixed'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  style={{ flex: 1, border: 'none', background: kind === k ? ink : '#fff', color: kind === k ? '#fff' : ink, fontFamily: dm, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  {k === 'percent' ? 'Percent' : 'Dollars'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={label} htmlFor="cp-value">{kind === 'percent' ? 'Percent off' : 'Dollars off'}</label>
            <input id="cp-value" style={input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
          <div>
            <label style={label} htmlFor="cp-uses">Uses</label>
            <input id="cp-uses" style={input} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} required />
          </div>
          <div>
            <label style={label} htmlFor="cp-expires">Expires</label>
            <input id="cp-expires" style={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <label style={label} htmlFor="cp-code">Code <span style={{ fontWeight: 500 }}>(blank = issued)</span></label>
            <input id="cp-code" style={{ ...input, textTransform: 'uppercase' }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WELCOME5" autoCapitalize="characters" />
          </div>
          <div>
            <label style={label} htmlFor="cp-email">Only for this email <span style={{ fontWeight: 500 }}>(optional)</span></label>
            <input id="cp-email" style={input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@email.com" />
          </div>
          <div>
            <label style={label} htmlFor="cp-min">Minimum booking <span style={{ fontWeight: 500 }}>(optional, $)</span></label>
            <input id="cp-min" style={input} inputMode="decimal" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="200" />
          </div>
          <div>
            <label style={label} htmlFor="cp-note">Note <span style={{ fontWeight: 500 }}>(optional)</span></label>
            <input id="cp-note" style={input} value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Instagram giveaway, March" />
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 14, color: soft }}>This coupon will be: <strong style={{ color: ink }}>{preview}</strong>. Tours only.</p>
        {formError && <p role="alert" style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: '#B3261E' }}>{formError}</p>}
        <button type="submit" disabled={creating}
          style={{ marginTop: 12, height: 44, padding: '0 22px', borderRadius: 10, border: 'none', background: ink, color: '#fff', fontFamily: dm, fontWeight: 600, fontSize: 14, cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Working…' : 'Create coupon'}
        </button>
      </form>

      {/* Search */}
      <form onSubmit={(e) => { e.preventDefault(); void load() }} style={{ display: 'flex', gap: 8, marginTop: 26, maxWidth: 560 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, email or note" aria-label="Search coupons" style={{ ...input, flex: 1 }} />
        <button type="submit" disabled={loading} style={{ height: 44, padding: '0 22px', borderRadius: 10, border: 'none', background: ink, color: '#fff', fontFamily: dm, fontWeight: 600, fontSize: 14, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </form>

      {note && <p role="status" style={{ marginTop: 14, fontSize: 14, color: ink, fontWeight: 600 }}>{note}</p>}

      {coupons && shown.length === 0 && (
        <p style={{ marginTop: 24, color: soft, fontSize: 14 }}>{coupons.length === 0 ? 'No coupons yet. The first one is thirty seconds away, above.' : 'Nothing matches that filter.'}</p>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shown.map((c) => {
          const s = state(c)
          const uses = redemptions.filter((r) => r.coupon_id === c.id)
          const isOpen = open === c.id
          return (
            <div key={c.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center' }}>
                <button type="button" onClick={() => copy(c.code)} title="Copy the code" aria-label={`Copy ${c.code}`}
                  style={{ fontFamily: dm, fontWeight: 800, fontSize: 18, letterSpacing: '0.06em', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', color: ink, minHeight: 44 }}>
                  {c.code}
                </button>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 9999, background: BADGE[s].bg, color: BADGE[s].fg }}>{BADGE[s].label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, ...tnum }}>{c.uses} / {c.max_uses} used</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: ink }}>{describeCoupon(c)}</p>
              <div style={{ marginTop: 8, display: 'grid', gap: '4px 24px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13, color: soft, lineHeight: 1.5 }}>
                <div>Created {when(c.created_at)}{c.source ? ` by ${c.source}` : ''}</div>
                {c.note && <div>{c.note}</div>}
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {uses.length > 0 && <Action label={isOpen ? 'Hide uses' : `Show ${uses.length} use${uses.length === 1 ? '' : 's'}`} onClick={() => setOpen(isOpen ? null : c.id)} busy={false} />}
                {c.status === 'active' && <Action label="Pause" onClick={() => act(c.id, 'pause')} busy={busy === c.id + 'pause'} />}
                {c.status === 'paused' && <Action label="Resume" onClick={() => act(c.id, 'resume')} busy={busy === c.id + 'resume'} />}
                {c.status !== 'void' && confirmVoid !== c.id && <Action label="Void" danger onClick={() => setConfirmVoid(c.id)} busy={false} />}
                {confirmVoid === c.id && (
                  <>
                    <span style={{ fontSize: 13, color: '#B3261E', fontWeight: 600 }}>Void {c.code}? Nobody can use it after this.</span>
                    <Action label="Yes, void it" danger onClick={() => act(c.id, 'void')} busy={busy === c.id + 'void'} />
                    <Action label="Back" onClick={() => setConfirmVoid(null)} busy={false} />
                  </>
                )}
              </div>

              {isOpen && (
                <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13, color: soft }}>
                  {uses.map((r, i) => (
                    <li key={i} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...tnum }}>
                      <span>{when(r.created_at)}</span>
                      <span style={{ color: ink, fontWeight: 600 }}>−{money(r.amount)}</span>
                      <span>{r.email ?? '—'}</span>
                      {r.booking_id && <Link href={`/admin/bookings?booking=${r.booking_id}`} style={{ color: ink, fontWeight: 600 }}>Booking →</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Action({ label, onClick, busy, danger }: { label: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      style={{ height: 44, padding: '0 16px', borderRadius: 9, border: `1px solid ${danger ? 'rgba(179,38,30,0.35)' : 'rgba(0,0,0,0.14)'}`, background: '#fff', color: danger ? '#B3261E' : ink, fontFamily: dm, fontWeight: 600, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
      {busy ? 'Working…' : label}
    </button>
  )
}
