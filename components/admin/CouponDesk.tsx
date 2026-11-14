'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { describeCoupon, type CouponRow } from '@/lib/coupons'
import Arrow from '@/components/ui/Arrow'
import Segmented from '@/components/admin/Segmented'
import { CopyButton, focusIsWithin, useBusy, useClosing, useResultNote } from '@/components/admin/AdminUi'
import { money, stamp } from '@/lib/admin-format'

/**
 * Coupon desk.
 *
 * Three jobs, in the order they come up: see what is live and what has been
 * used; make a new code in under thirty seconds with no invalid state
 * possible; stop one. Every rule is spelled out in plain words on its row.
 *
 * The requests (GET, POST, PATCH to /api/admin/coupons) and their bodies are
 * unchanged by the Nov 13 2026 redesign, which moved the desk onto the shared
 * .adm system: native radio groups, one confirmation pattern (a box whose
 * question takes focus, Back or Escape returning focus), forms whose heading
 * takes focus as they open, and times on the owner's clock with the zone
 * named. Styles: the .adm-cp block in app/globals.css.
 */

interface Coupon extends CouponRow { source: string | null; note: string | null; created_at: string; updated_at: string }
interface Redemption { coupon_id: string; booking_id: string | null; email: string | null; amount: number | string; created_at: string }

type State = 'active' | 'used' | 'paused' | 'expired' | 'void'
type Filter = 'all' | State

interface EditDraft {
  kind: 'percent' | 'fixed'; value: string; appliesTo: 'tour' | 'transfer' | 'both'
  maxUses: string; usesPerEmail: string; minTotal: string; expiresAt: string; email: string; note: string
}

const STATE: Record<State, { cls: string; label: string }> = {
  active: { cls: 'adm-badge--ok', label: 'Live' },
  used: { cls: 'adm-badge--plain', label: 'Used up' },
  paused: { cls: 'adm-badge--warn', label: 'Paused' },
  expired: { cls: 'adm-badge--plain', label: 'Expired' },
  void: { cls: 'adm-badge--bad', label: 'Void' },
}

/** A coupon's state as a guest would meet it. Exported for tests/unit/coupon-desk.spec.tsx. */
export function couponState(c: Pick<Coupon, 'status' | 'expires_at' | 'max_uses' | 'uses'>, now = Date.now()): State {
  if (c.status === 'void') return 'void'
  if (c.status === 'paused') return 'paused'
  if (c.expires_at && Date.parse(c.expires_at) < now) return 'expired'
  if (c.max_uses != null && Number(c.uses) >= Number(c.max_uses)) return 'used'
  return 'active'
}

function plusDays(d: number) { return new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10) }
/**
 * The Jamaica calendar day a stored expiry falls on, for the edit form's date
 * box. A code is saved as "the end of that day in Jamaica" (23:59:59 -05:00),
 * which is the NEXT day in UTC; filling the box from the UTC date showed that
 * next day, and saving wrote the end of it, so every edit of any field moved
 * the expiry one day later.
 */
export function expiryDay(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? '' : new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10)
}

const KINDS = [{ key: 'percent' as const, label: 'Percent' }, { key: 'fixed' as const, label: 'Dollars' }]
const APPLIES = [{ key: 'both' as const, label: 'Both' }, { key: 'tour' as const, label: 'Tours' }, { key: 'transfer' as const, label: 'Rides' }]

/** The fields both forms share, laid out the same way; `id` keeps each form's labels unique. */
function CouponFields({ id, d, set, withCode }: {
  id: string
  d: EditDraft & { code?: string }
  set: (patch: Partial<EditDraft & { code: string }>) => void
  withCode?: boolean
}) {
  return (
    <div className="adm-cp-grid">
      <div className="adm-cp-field">
        <Segmented label="Discount" showLabel value={d.kind} options={KINDS} onChange={(kind) => set({ kind })} />
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-value`}>{d.kind === 'percent' ? 'Percent off' : 'Dollars off'}</label>
        <input id={`${id}-value`} className="adm-input" inputMode="decimal" value={d.value} onChange={(e) => set({ value: e.target.value })} required />
      </div>
      <div className="adm-cp-field">
        <Segmented label="Applies to" showLabel value={d.appliesTo} options={APPLIES} onChange={(appliesTo) => set({ appliesTo })} />
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-uses`}>Uses in total</label>
        <input id={`${id}-uses`} className="adm-input" inputMode="numeric" value={d.maxUses} onChange={(e) => set({ maxUses: e.target.value })} placeholder="Unlimited" aria-describedby={`${id}-uses-h`} />
        <p id={`${id}-uses-h`} className="adm-help">Leave blank for no limit.</p>
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-per`}>Uses per guest</label>
        <input id={`${id}-per`} className="adm-input" inputMode="numeric" value={d.usesPerEmail} onChange={(e) => set({ usesPerEmail: e.target.value })} placeholder="No limit" aria-describedby={`${id}-per-h`} />
        <p id={`${id}-per-h`} className="adm-help">Counted by email. Blank for no limit.</p>
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-exp`}>Expires</label>
        <input id={`${id}-exp`} className="adm-input" type="date" value={d.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} aria-describedby={`${id}-exp-h`} />
        <p id={`${id}-exp-h`} className="adm-help">At the end of that day, Jamaica time. Blank for never.</p>
      </div>
      {withCode && (
        <div className="adm-cp-field">
          <label className="adm-label" htmlFor={`${id}-code`}>Code</label>
          <input id={`${id}-code`} className="adm-input adm-cp-code-input" value={d.code ?? ''} onChange={(e) => set({ code: e.target.value })} placeholder="JAMAICA5" autoCapitalize="characters" aria-describedby={`${id}-code-h`} />
          <p id={`${id}-code-h`} className="adm-help">Blank makes a random MAPL-XXXX-XXXX.</p>
        </div>
      )}
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-email`}>Only for this email</label>
        <input id={`${id}-email`} className="adm-input" type="email" inputMode="email" value={d.email} onChange={(e) => set({ email: e.target.value })} placeholder="Anyone" />
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-min`}>Minimum booking, $</label>
        <input id={`${id}-min`} className="adm-input" inputMode="decimal" value={d.minTotal} onChange={(e) => set({ minTotal: e.target.value })} placeholder="None" />
      </div>
      <div className="adm-cp-field">
        <label className="adm-label" htmlFor={`${id}-note`}>Note</label>
        <input id={`${id}-note`} className="adm-input" value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Instagram giveaway, March" />
      </div>
    </div>
  )
}

/** The rule in words, as the guest's coupon will behave. */
function previewOf(d: EditDraft): string {
  return describeCoupon({
    kind: d.kind, value: Number(d.value) || 0, applies_to: d.appliesTo,
    max_uses: d.maxUses.trim() ? Number(d.maxUses) : null, uses_per_email: d.usesPerEmail.trim() ? Number(d.usesPerEmail) : null,
    email: d.email.trim() || null, min_total: d.minTotal.trim() ? Number(d.minTotal) : null,
    expires_at: d.expiresAt ? `${d.expiresAt}T23:59:59-05:00` : null,
  })
}

/** What a code has taken off so far, summed in cents from its uses. Exported for tests/unit/coupon-desk.spec.tsx. */
export function givenOf(uses: Pick<Redemption, 'amount'>[]): number {
  return uses.reduce((cents, r) => cents + Math.round(Number(r.amount || 0) * 100), 0) / 100
}

const FRESH: EditDraft & { code: string } = { kind: 'percent', value: '5', appliesTo: 'both', maxUses: '', usesPerEmail: '1', minTotal: '', expiresAt: '', email: '', note: '', code: '' }

export default function CouponDesk() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  // The result of the last action, in a toast at the foot of the list.
  const { setNote, keepClear, toast } = useResultNote()
  const { busy, start, end } = useBusy()
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  // The card being edited and its draft. One at a time.
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  // Keyed by card, so a slow answer never lands in another card's form.
  const [editError, setEditError] = useState<{ id: string; text: string } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const editingNow = useRef<string | null>(null)
  useEffect(() => { editingNow.current = editing }, [editing])
  // The new-coupon form opens on request, set up for the common case: a
  // shared word code, 5% off tours and rides, once per guest, six months.
  const [making, setMaking] = useState(false)
  const [form, setForm] = useState({ ...FRESH, expiresAt: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // The card just created, so the eye lands on it after the list reloads.
  const [justMade, setJustMade] = useState<string | null>(null)
  const searchId = useId()
  const leave = useClosing()
  const motion = (key: string) => (leave.closing === key ? 'adm-leave' : 'adm-enter')
  // Where focus goes once React has committed the change that showed or hid
  // it (the first of these ids that exists): a panel's heading as it opens,
  // the button that opened it as it closes, the card itself after an action
  // that replaced the button pressed.
  const focusNext = useRef<string[] | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    const el = focusNext.current.map((id) => document.getElementById(id)).find(Boolean)
    focusNext.current = null
    el?.focus()
  })

  useEffect(() => {
    if (!justMade) return
    document.getElementById(`coupon-${justMade}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = window.setTimeout(() => setJustMade(null), 2500)
    return () => window.clearTimeout(t)
  }, [justMade, coupons])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/coupons?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) { setNote({ text: data.error ?? 'Could not load coupons.', bad: true }); return }
      setCoupons(data.coupons ?? [])
      setRedemptions(data.redemptions ?? [])
    } catch {
      setNote({ text: 'Could not load coupons. Please try again.', bad: true })
    } finally {
      setLoading(false)
    }
  }, [q, setNote])

  useEffect(() => { void load() }, [load])

  function openForm() {
    setForm({ ...FRESH, expiresAt: plusDays(180) })
    setFormError(null)
    focusNext.current = ['cp-new-h']
    setMaking(true)
  }
  function closeForm() {
    leave.close('new', () => {
      focusNext.current = ['cp-new-btn']
      setMaking(false)
    })
  }

  const all = coupons ?? []
  const shown = all.filter((c) => filter === 'all' || couponState(c) === filter)
  const counts = all.reduce<Record<string, number>>((m, c) => { const s = couponState(c); m[s] = (m[s] ?? 0) + 1; return m }, {})
  const filters = [
    { key: 'all' as const, label: 'All', count: all.length },
    ...(['active', 'used', 'paused', 'expired', 'void'] as const).map((s) => ({ key: s, label: STATE[s].label, count: counts[s] ?? 0 })),
  ]

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    setFormError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: form.kind, value: Number(form.value), appliesTo: form.appliesTo, code: form.code.trim() || undefined, email: form.email.trim() || undefined, maxUses: form.maxUses.trim() ? Number(form.maxUses) : null, usesPerEmail: form.usesPerEmail.trim() ? Number(form.usesPerEmail) : null, minTotal: form.minTotal.trim() || undefined, expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59-05:00` : undefined, note: form.note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'That did not work.'); return }
      setNote({ text: `Created ${data.coupon.code}: ${describeCoupon(data.coupon)}.` })
      focusNext.current = ['cp-new-btn']
      setMaking(false)
      await load()
      focusNext.current = [`coupon-${data.coupon.id}-h`, 'cp-new-btn']
      setJustMade(data.coupon.id)
    } catch {
      setFormError('That did not work. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function act(id: string, action: 'pause' | 'resume' | 'void') {
    if (busy[id]) return
    start(id, action)
    setNote(null)
    try {
      const res = await fetch('/api/admin/coupons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const data = await res.json()
      if (!res.ok) { setNote({ text: data.error ?? 'That did not work.', bad: true }); return }
      setNote({ text: action === 'void' ? 'Coupon voided. It can no longer be used.' : action === 'pause' ? 'Coupon paused. Resume it any time.' : 'Coupon is live again.' })
      // The button pressed is replaced (Pause by Resume, the box by nothing): focus lands on the card,
      // or on the page heading if the filter no longer shows it; never if the owner has moved on meanwhile.
      const back = [`coupon-${id}-h`, 'cp-h1']
      if (focusIsWithin(`coupon-${id}`)) focusNext.current = back
      setConfirmVoid((v) => (v === id ? null : v))
      await load()
      if (focusIsWithin(`coupon-${id}`)) focusNext.current = back
    } catch {
      setNote({ text: 'That did not work. Please try again.', bad: true })
    } finally {
      end(id)
    }
  }

  function startEdit(c: Coupon) {
    setEditing(c.id); setEditError(null); setConfirmVoid(null)
    setDraft({
      kind: c.kind, value: String(Number(c.value)), appliesTo: c.applies_to,
      maxUses: c.max_uses == null ? '' : String(c.max_uses), usesPerEmail: c.uses_per_email == null ? '' : String(c.uses_per_email),
      minTotal: c.min_total == null ? '' : String(Number(c.min_total)), expiresAt: expiryDay(c.expires_at),
      email: c.email ?? '', note: c.note ?? '',
    })
    focusNext.current = [`edit-${c.id}-h`]
  }
  function stopEdit(id: string) {
    leave.close(`edit-${id}`, () => {
      focusNext.current = [`edit-btn-${id}`]
      setEditing(null); setDraft(null); setEditError(null)
    })
  }

  async function saveEdit(id: string) {
    if (!draft || saving === id) return
    setSaving(id); setEditError(null)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'update', kind: draft.kind, value: Number(draft.value), appliesTo: draft.appliesTo, maxUses: draft.maxUses.trim() ? Number(draft.maxUses) : null, usesPerEmail: draft.usesPerEmail.trim() ? Number(draft.usesPerEmail) : null, minTotal: draft.minTotal.trim() || null, expiresAt: draft.expiresAt ? `${draft.expiresAt}T23:59:59-05:00` : null, email: draft.email.trim() || undefined, note: draft.note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError({ id, text: data.error ?? 'That did not work.' }); return }
      setNote({ text: `Saved ${data.coupon.code}: ${describeCoupon(data.coupon)}.` })
      const back = [`edit-btn-${id}`, `coupon-${id}-h`, 'cp-h1']
      if (focusIsWithin(`coupon-${id}`)) focusNext.current = back
      // Close this card's form only; another card's form opened meanwhile stays.
      if (editingNow.current === id) { setEditing(null); setDraft(null) }
      await load()
      if (focusIsWithin(`coupon-${id}`)) focusNext.current = back
    } catch {
      setEditError({ id, text: 'That did not work. Please try again.' })
    } finally {
      setSaving((v) => (v === id ? null : v))
    }
  }

  function askVoid(id: string) {
    focusNext.current = [`void-${id}-h`]
    setConfirmVoid(id)
  }
  function backFromVoid(id: string) {
    leave.close(`void-${id}`, () => {
      focusNext.current = [`void-btn-${id}`]
      setConfirmVoid(null)
    })
  }

  return (
    <div className="adm" onFocus={keepClear}>
      <div className="adm-cp-top">
        <h1 id="cp-h1" tabIndex={-1} className="adm-h1">Coupons</h1>
        {!making && <button id="cp-new-btn" type="button" className="adm-btn adm-btn--primary" onClick={openForm}>New coupon</button>}
      </div>
      <p className="adm-lead">
        A coupon takes a percent or a fixed amount off a tour or an airport ride at checkout; it is not money, so nothing is
        refunded on it. <strong className="adm-strong">Every discount comes out of MAPL Tours Jamaica&rsquo;s margin:</strong> the
        driver or tour operator is paid their full rate, and a code never takes more than the margin on that booking. JAMAICA5 is
        the public code the bio page hands out.
      </p>

      {making && (
        <form onSubmit={create} className={`adm-card adm-cp-new ${motion('new')}`} aria-labelledby="cp-new-h" onAnimationEnd={leave.onEnd} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeForm() } }}>
          <div className="adm-card-in">
            <h2 id="cp-new-h" tabIndex={-1} className="adm-h3">New coupon</h2>
            <CouponFields id="cp" d={form} set={(p) => setForm((f) => ({ ...f, ...p }))} withCode />
            <p className="adm-cp-preview">This coupon will be: <strong>{previewOf(form)}</strong>. Taken from MAPL Tours Jamaica&rsquo;s margin, never from the driver or operator.</p>
            {formError && <p role="alert" className="adm-error">{formError}</p>}
            <div className="adm-actions">
              <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={creating || undefined} aria-busy={creating || undefined}>{creating ? 'Creating…' : 'Create coupon'}</button>
              <button type="button" className="adm-btn" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="adm-toolbar">
        <form className="adm-cp-search" onSubmit={(e) => { e.preventDefault(); void load() }} role="search">
          <div className="adm-search">
            <label htmlFor={searchId} className="visually-hidden">Search coupons</label>
            <Search className="adm-search-icon" size={18} strokeWidth={2.25} aria-hidden />
            <input id={searchId} type="search" className="adm-input adm-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, email or note" enterKeyHint="search" />
          </div>
          <button type="submit" className="adm-btn" aria-disabled={loading || undefined} aria-busy={loading || undefined}>{loading ? 'Searching…' : 'Search'}</button>
        </form>
        <Segmented label="Show coupons" value={filter} onChange={setFilter} options={filters} unit="coupon" grid />
      </div>

      {coupons === null && loading && <p className="adm-empty">Loading coupons…</p>}
      {coupons && shown.length === 0 && (
        <p className="adm-empty">{all.length === 0 ? 'No coupons yet. Make the first one with New coupon. 🇯🇲' : 'Nothing matches that filter.'}</p>
      )}

      <ol className="adm-list adm-cp-list">
        {shown.map((c) => {
          const s = couponState(c)
          const uses = redemptions.filter((r) => r.coupon_id === c.id)
          const given = givenOf(uses)
          const isOpen = open === c.id
          // Each action names its code for screen readers ("Edit JAMAICA5"); the eye reads "Edit".
          const code = <span className="visually-hidden"> {c.code}</span>
          return (
            <li key={c.id} id={`coupon-${c.id}`} className={justMade === c.id ? 'adm-card adm-cp is-new' : 'adm-card adm-cp'}>
              <div className="adm-card-in">
                <div className="adm-cp-head">
                  <h2 id={`coupon-${c.id}-h`} tabIndex={-1} className="adm-code">{c.code}</h2>
                  <CopyButton text={c.code} report={setNote} />
                  <span className={`adm-badge ${STATE[s].cls}`}>{STATE[s].label}</span>
                  <span className="adm-cp-uses">
                    {c.max_uses == null ? `${c.uses} used` : `${c.uses} of ${c.max_uses} used`}
                    {given > 0 && <span className="adm-cp-given">, {money(given)} off</span>}
                  </span>
                </div>
                <p className="adm-cp-rule">{describeCoupon(c)}</p>
                <p className="adm-meta">
                  <span className="adm-nowrap">Created {stamp(c.created_at)}</span>{c.source ? ` by ${c.source}` : ''}{c.note ? <> · {c.note}</> : null}
                </p>

                {confirmVoid !== c.id && editing !== c.id && (
                  <div className="adm-actions adm-cp-actions">
                    {uses.length > 0 && (
                      <button type="button" className="adm-btn adm-btn--sm" aria-expanded={isOpen} aria-controls={`uses-${c.id}`} onClick={() => setOpen(isOpen ? null : c.id)}>
                        {isOpen ? 'Hide uses' : `Show ${uses.length} use${uses.length === 1 ? '' : 's'}`}<span className="visually-hidden"> of {c.code}</span>
                      </button>
                    )}
                    {c.status !== 'void' && <button id={`edit-btn-${c.id}`} type="button" className="adm-btn adm-btn--sm" onClick={() => startEdit(c)}>Edit{code}</button>}
                    {/* Pausing only means something while the code can be used. */}
                    {s === 'active' && <button type="button" className="adm-btn adm-btn--sm" aria-busy={busy[c.id] === 'pause' || undefined} onClick={() => void act(c.id, 'pause')}>{busy[c.id] === 'pause' ? 'Pausing…' : 'Pause'}{code}</button>}
                    {c.status === 'paused' && <button type="button" className="adm-btn adm-btn--sm" aria-busy={busy[c.id] === 'resume' || undefined} onClick={() => void act(c.id, 'resume')}>{busy[c.id] === 'resume' ? 'Resuming…' : 'Resume'}{code}</button>}
                    {c.status !== 'void' && <button id={`void-btn-${c.id}`} type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => askVoid(c.id)}>Void{code}</button>}
                  </div>
                )}

                {confirmVoid === c.id && (
                  <section aria-labelledby={`void-${c.id}-h`} className={`adm-ask ${motion(`void-${c.id}`)}`} onAnimationEnd={leave.onEnd} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); backFromVoid(c.id) } }}>
                    <h3 id={`void-${c.id}-h`} tabIndex={-1} className="adm-h4 adm-h4--ask">Void {c.code}?</h3>
                    <p className="adm-block">Nobody can use it after this. It cannot be undone.</p>
                    <div className="adm-actions">
                      <button type="button" className="adm-btn adm-btn--bad" aria-disabled={busy[c.id] === 'void' || undefined} aria-busy={busy[c.id] === 'void' || undefined} onClick={() => void act(c.id, 'void')}>
                        {busy[c.id] === 'void' ? 'Voiding…' : 'Yes, void it'}
                      </button>
                      <button type="button" className="adm-btn" onClick={() => backFromVoid(c.id)}>Back</button>
                    </div>
                  </section>
                )}

                {editing === c.id && draft && (
                  <form onSubmit={(e) => { e.preventDefault(); void saveEdit(c.id) }} className={`adm-cp-edit ${motion(`edit-${c.id}`)}`} aria-labelledby={`edit-${c.id}-h`} onAnimationEnd={leave.onEnd}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); stopEdit(c.id) } }}>
                    <h3 id={`edit-${c.id}-h`} tabIndex={-1} className="adm-h4">Editing {c.code}</h3>
                    <p className="adm-help adm-help--soft">The code and its uses so far stay as they are.</p>
                    <CouponFields id={`ed-${c.id}`} d={draft} set={(p) => setDraft((d) => (d ? { ...d, ...p } : d))} />
                    <p className="adm-cp-preview">This coupon will be: <strong>{previewOf(draft)}</strong>.</p>
                    {editError?.id === c.id && <p role="alert" className="adm-error">{editError.text}</p>}
                    <div className="adm-actions">
                      <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={saving === c.id || undefined} aria-busy={saving === c.id || undefined}>{saving === c.id ? 'Saving…' : 'Save changes'}</button>
                      <button type="button" className="adm-btn" onClick={() => stopEdit(c.id)}>Cancel</button>
                    </div>
                  </form>
                )}

                {isOpen && (
                  <ul id={`uses-${c.id}`} className="adm-cp-usage adm-enter">
                    {uses.map((r, i) => (
                      <li key={i}>
                        <span className="adm-nowrap">{stamp(r.created_at)}</span>
                        <span className="adm-cp-usage-v">{money(-Number(r.amount))}</span>
                        <span>{r.email ?? 'No email'}</span>
                        {r.booking_id && <Link className="adm-inline-link" href={`/admin/bookings?booking=${r.booking_id}`}>Booking<Arrow /></Link>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {toast}
    </div>
  )
}
