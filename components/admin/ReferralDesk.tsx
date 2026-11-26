'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useResultNote, CopyButton } from '@/components/admin/AdminUi'
import Segmented from '@/components/admin/Segmented'
import type { AdminReferrerView, EarningView, PayoutView, CodeView } from '@/lib/referrals/ledger'
import { DEFAULT_COMMISSION_PERCENT, MAX_COMMISSION_PERCENT, REFERRAL_DISCOUNT_PERCENT, dayText, percentText, shortDay, usd } from '@/lib/referrals/rules'

/**
 * The referral desk (/admin/referrals; owner, Nov 26 2026: "there should be a
 * way to manage the referrer and see payouts on the admin page"). Invite
 * someone (the address is the invitation), see every referrer's codes,
 * bookings, commissions and payouts, and pause, resume or remove them, change
 * a rate, hold a code, not count a booking, or mark a payout problem
 * resolved. Every change goes through /api/admin/referrals and answers with
 * the whole view again, so nothing on the page is a guess.
 */

type AdminView = { referrers: AdminReferrerView[]; totals: { active: number; invited: number; paused: number; liveCodes: number; bookings: number; earnedCents: number; paidCents: number; owedCents: number } }
/** Past this many working referrers the list gets a filter by state. */
const FILTER_FROM = 10
type Api = { ok: boolean; status: number; json: Record<string, unknown> }

async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<Api> {
  try {
    const res = await fetch('/api/admin/referrals', { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
    return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 0, json: { error: 'No connection. Try again.' } }
  }
}

const STATUS_BADGE: Record<AdminReferrerView['status'], [string, string]> = {
  active: ['adm-badge adm-badge--ok', 'Active'],
  invited: ['adm-badge adm-badge--warn', 'Invited'],
  paused: ['adm-badge adm-badge--plain', 'Paused'],
  removed: ['adm-badge adm-badge--plain', 'Removed'],
}

/**
 * "Oct 31, 8:00 PM Toronto" (with the year when it is not this year). Put together from the parts, never
 * from toLocaleString: Safari joins a date and a time with "at", so the server's text and Safari's
 * differed and React threw the server's page away (a hydration error on every load in Safari).
 */
const STAMP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
function stamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p: Record<string, string> = {}
  for (const x of STAMP.formatToParts(d)) p[x.type] = x.value
  const thisYear = STAMP.formatToParts(new Date()).find((x) => x.type === 'year')?.value
  return `${p.month} ${p.day}${p.year === thisYear ? '' : `, ${p.year}`}, ${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toUpperCase()} Toronto`
}

export default function ReferralDesk({ initial, payoutsOn }: { initial: AdminView; payoutsOn: boolean }) {
  const [view, setView] = useState<AdminView>(initial)
  const { setNote, keepClear, toast } = useResultNote()
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<Api> => {
    setBusy(key)
    const r = await send(method, body)
    setBusy(null)
    if (r.ok && r.json.view) setView(r.json.view as AdminView)
    else if (r.ok) window.location.reload()
    setNote({ text: (r.json.message as string) ?? (r.json.error as string) ?? (r.ok ? 'Done.' : 'That did not save.'), bad: !r.ok || r.json.sent === false })
    return r
  }

  const live = view.referrers.filter((r) => r.status !== 'removed')
  const removed = view.referrers.filter((r) => r.status === 'removed')
  const attention = live.flatMap((r) => r.attention.map((a) => ({ who: r.name, text: a, id: r.id })))
  // The tile counts everyone on the list below it, then says what state they are in.
  const byState = [[view.totals.active, 'active'], [view.totals.invited, 'invited'], [view.totals.paused, 'paused']].filter(([n]) => Number(n) > 0).map(([n, w]) => `${n} ${w}`).join(', ')

  // A long list gets a filter by state; a short one is read whole.
  const [show, setShow] = useState<'all' | 'active' | 'invited' | 'paused'>('all')
  const filtering = live.length > FILTER_FROM
  const shown = filtering && show !== 'all' ? live.filter((r) => r.status === show) : live
  const countOf = (s: string) => live.filter((r) => r.status === s).length

  // A referrer just invited: the form closes, focus goes to their card, and it glows once (as a new coupon does).
  const [justAdded, setJustAdded] = useState<string | null>(null)
  useEffect(() => {
    if (!justAdded) return
    const h = document.getElementById(`referrer-${justAdded}-h`)
    if (h) {
      h.focus({ preventScroll: true })
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      h.closest('li')?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' })
    }
    const t = window.setTimeout(() => setJustAdded(null), 2500)
    return () => window.clearTimeout(t)
  }, [justAdded])
  const invited = (id: string) => { setShow('all'); setJustAdded(id) }

  return (
    <div className="adm" onFocus={keepClear}>
      <h1 className="adm-h1">Referrals</h1>
      <p className="adm-lead">
        Guests get {REFERRAL_DISCOUNT_PERCENT}% off with a referrer&apos;s code, and the referrer earns their rate of what the guest pays, sent every Monday after the trip to their own Wise account.
      </p>
      <p className={payoutsOn ? 'adm-note adm-note--ok' : 'adm-note adm-note--warn'} style={{ maxWidth: '42.5rem' }}>
        {payoutsOn
          ? 'Automatic payouts are on: every Monday at 09:45 in Jamaica, with any missed Monday caught up the next day.'
          : 'Automatic payouts are off. Nothing is paid until REFERRAL_PAYOUTS_ENABLED is set to 1 on Netlify; until then every run only plans.'}
      </p>

      <section className="adm-tiles" aria-label="Referral figures">
        <div className="adm-tile"><p className="adm-kicker">Referrers</p><p className="adm-tile-v adm-tnum">{live.length}</p><p className="adm-tile-sub">{byState || 'None yet'}</p></div>
        <div className="adm-tile"><p className="adm-kicker">Live codes</p><p className="adm-tile-v adm-tnum">{view.totals.liveCodes}</p><p className="adm-tile-sub">{view.totals.bookings} paid bookings</p></div>
        <div className="adm-tile"><p className="adm-kicker">Owed</p><p className="adm-tile-v adm-tnum">{usd(view.totals.owedCents)}</p><p className="adm-tile-sub">Trips to come and the next payout</p></div>
        <div className="adm-tile"><p className="adm-kicker">Paid</p><p className="adm-tile-v adm-tnum">{usd(view.totals.paidCents)}</p><p className="adm-tile-sub">To referrers so far</p></div>
      </section>

      {attention.length > 0 && (
        <section className="adm-section" aria-labelledby="ref-attn">
          <h2 className="adm-h2" id="ref-attn">Needs a look</h2>
          <ul className="adm-list">
            {attention.map((a, i) => (
              <li key={i} className="adm-callout adm-callout--warn">
                <p className="adm-kicker">{a.who}</p>
                <p className="adm-callout-text">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Invite busy={busy} run={run} setNote={setNote} startOpen={view.referrers.length === 0} onInvited={invited} />

      <section className="adm-section" aria-labelledby="ref-list">
        <h2 className="adm-h2" id="ref-list">Referrers</h2>
        {filtering && (
          <div style={{ marginTop: 'var(--adm-gap)' }}>
            <Segmented label="Show referrers" value={show} onChange={setShow} unit="referrer" grid
              options={[
                { key: 'all', label: 'All', count: live.length },
                { key: 'active', label: 'Active', count: countOf('active') },
                { key: 'invited', label: 'Invited', count: countOf('invited') },
                { key: 'paused', label: 'Paused', count: countOf('paused') },
              ]} />
          </div>
        )}
        {live.length === 0 ? (
          <p className="adm-empty">No referrers yet. Invite the first one above.</p>
        ) : shown.length === 0 ? (
          <p className="adm-empty">No {show} referrers.</p>
        ) : (
          <ul className="adm-list">
            {shown.map((r) => <ReferrerCard key={r.id} r={r} busy={busy} run={run} report={setNote} isNew={justAdded === r.id} />)}
          </ul>
        )}
        {removed.length > 0 && (
          <details className="adm-details" style={{ marginTop: 'var(--adm-gap)' }}>
            <summary>Removed ({removed.length})</summary>
            <ul className="adm-list">{removed.map((r) => <ReferrerCard key={r.id} r={r} busy={busy} run={run} report={setNote} />)}</ul>
          </details>
        )}
      </section>

      {toast}
    </div>
  )
}

/* ── Invite ──────────────────────────────────────────────────────────── */

function Invite({ busy, run, setNote, startOpen, onInvited }: { busy: string | null; run: (key: string, m: 'POST' | 'PATCH', b: Record<string, unknown>) => Promise<Api>; setNote: (n: { text: string; bad?: boolean } | null) => void; startOpen: boolean; onInvited: (id: string) => void }) {
  const id = useId()
  const [open, setOpen] = useState(startOpen)
  const openRef = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); requestAnimationFrame(() => openRef.current?.focus()) }
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [business, setBusiness] = useState('')
  const [percent, setPercent] = useState(String(DEFAULT_COMMISSION_PERCENT))
  const [testTo, setTestTo] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState<{ field: string | null; text: string } | null>(null)

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr(null)
    const r = await run('invite', 'POST', { action: 'invite', email, name, business, percent })
    if (r.ok) {
      setEmail(''); setName(''); setBusiness(''); setPercent(String(DEFAULT_COMMISSION_PERCENT)); setPreview(null)
      // Their card takes focus; the form closes, so "Invite someone" is there for the next one.
      if (typeof r.json.id === 'string' && r.json.view) { setOpen(false); onInvited(r.json.id) }
      return
    }
    const field = (r.json.field as string) ?? null
    setErr({ field, text: (r.json.error as string) ?? 'That did not save.' })
    if (field) document.getElementById(`${id}-${field}`)?.focus()
  }
  async function showPreview() {
    const r = await send('POST', { action: 'preview_invite', name, email, percent })
    if (r.ok) setPreview(r.json.html as string)
    else setNote({ text: (r.json.error as string) ?? 'The preview did not load.', bad: true })
  }
  async function test() {
    if (busy) return
    const r = await run('test', 'POST', { action: 'test_invite', to: testTo, name, email, percent })
    if (!r.ok && r.json.field === 'to') document.getElementById(`${id}-to`)?.focus()
  }

  const fieldErr = (f: string) => (err?.field === f ? `${id}-err` : undefined)
  if (!open) {
    // One button where the form will open: no scroll on a return visit, and nothing to hunt for. It is an
    // action, not a disclosure: the form takes its place and focus goes into it; Close brings focus back.
    return (
      <div className="adm-actions" style={{ marginTop: 'var(--adm-group)' }}>
        <button ref={openRef} type="button" className="adm-btn adm-btn--primary"
          onClick={() => { setOpen(true); requestAnimationFrame(() => document.getElementById(`${id}-email`)?.focus()) }}>Invite someone</button>
      </div>
    )
  }
  return (
    <section className="adm-section" aria-labelledby={`${id}-h`}>
      <h2 className="adm-h2" id={`${id}-h`}>Invite someone</h2>
      <div className="adm-card" style={{ marginTop: 'var(--adm-gap)' }}>
        <form className="adm-card-in" onSubmit={invite} noValidate>
          <div className="adm-cp-grid">
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-email`}>Email</label>
              <input id={`${id}-email`} className="adm-input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                aria-invalid={err?.field === 'email' || undefined} aria-describedby={[`${id}-email-h`, fieldErr('email')].filter(Boolean).join(' ')} />
              <p id={`${id}-email-h`} className="adm-help">The address they will sign in with. Signing in with it is the invitation.</p>
            </div>
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-name`}>Name</label>
              <input id={`${id}-name`} className="adm-input" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name"
                aria-invalid={err?.field === 'name' || undefined} aria-describedby={fieldErr('name')} />
            </div>
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-business`}>Business (optional)</label>
              <input id={`${id}-business`} className="adm-input" type="text" autoComplete="off" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="For example, a villa or guesthouse" />
            </div>
            <div className="adm-cp-field">
              <label className="adm-label" htmlFor={`${id}-percent`}>They earn (%)</label>
              <input id={`${id}-percent`} className="adm-input" type="text" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)}
                aria-invalid={err?.field === 'percent' || undefined} aria-describedby={[`${id}-percent-h`, fieldErr('percent')].filter(Boolean).join(' ')} />
              <p id={`${id}-percent-h`} className="adm-help">Of what the guest pays. Never more than MAPL keeps on the booking, up to {MAX_COMMISSION_PERCENT}%.</p>
            </div>
          </div>
          {err && <p id={`${id}-err`} className="adm-error" role="alert" style={{ marginTop: 12 }}>{err.text}</p>}
          <div className="adm-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="adm-btn adm-btn--primary" aria-busy={busy === 'invite' || undefined} aria-disabled={!!busy || undefined}>
              {busy === 'invite' ? 'Sending' : 'Send invitation'}
            </button>
            <button type="button" className="adm-btn" onClick={showPreview}>{preview ? 'Refresh the preview' : 'Preview the email'}</button>
            <button type="button" className="adm-btn" onClick={close}>Close</button>
          </div>
          <div className="adm-actions" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 16rem', maxWidth: '24rem' }}>
              <label className="adm-label" htmlFor={`${id}-to`}>Send a test to</label>
              <input id={`${id}-to`} className="adm-input" type="email" autoComplete="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="contact@mapltours.com" />
            </div>
            <button type="button" className="adm-btn" onClick={test} aria-busy={busy === 'test' || undefined} aria-disabled={!!busy || undefined}>{busy === 'test' ? 'Sending' : 'Send test'}</button>
          </div>
          <p className="adm-help">A test goes only to that address, marked [Test], and saves nothing. A real invitation also goes to the operations inbox as a blind copy.</p>
          {preview && <iframe className="adm-mail-frame" style={{ marginTop: 16 }} title="The invitation email" srcDoc={preview} sandbox="" />}
        </form>
      </div>
    </section>
  )
}

/* ── One referrer ────────────────────────────────────────────────────── */

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  invited: (d) => `Invited at ${percentText(Number(d.percent ?? DEFAULT_COMMISSION_PERCENT))}`,
  invite_sent: (d) => `Invitation sent${Number(d.sends) > 1 ? ` (${d.sends} times now)` : ''}`,
  terms_accepted: () => 'Agreed to the terms',
  code_created: (d) => `Made code ${d.code}`,
  code_pause: (d) => `Paused code ${d.code}`,
  code_resume: (d) => `Resumed code ${d.code}`,
  code_retire: (d) => `Retired code ${d.code}`,
  code_hold: (d) => `MAPL paused code ${d.code}`,
  code_release: (d) => `MAPL released code ${d.code}`,
  payout_account_added: (d) => `Added the Wise account ending ${d.last4}`,
  payout_account_changed: (d) => `Changed the Wise account to the one ending ${d.last4}${d.previous_last4 ? ` (was ${d.previous_last4})` : ''}`,
  paused: () => 'Paused by MAPL',
  resumed: () => 'Resumed by MAPL',
  removed: () => 'Removed',
  rate_changed: (d) => `Rate changed from ${percentText(Number(d.from))} to ${percentText(Number(d.to))}`,
  earning_voided: (d) => `A booking not counted${d.reason ? `: ${d.reason}` : ''}`,
  earning_restored: () => 'A booking counted again',
  earning_recorded_late: (d) => `A commission recorded late (${d.code})`,
  payout_resolved: () => 'A payout problem marked resolved',
}

type Run = (key: string, m: 'POST' | 'PATCH', b: Record<string, unknown>) => Promise<Api>
type Report = (n: { text: string; bad?: boolean; quiet?: boolean } | null) => void

function ReferrerCard({ r, busy, run, report, isNew = false }: { r: AdminReferrerView; busy: string | null; run: Run; report: Report; isNew?: boolean }) {
  const id = useId()
  const [confirm, setConfirm] = useState<'remove' | 'pause' | null>(null)
  const [rate, setRate] = useState(String(r.percent))
  const [note, setNote] = useState(r.note ?? '')
  const cardRef = useRef<HTMLLIElement>(null)
  const [cls, label] = STATUS_BADGE[r.status]
  const k = (a: string) => `${r.id}:${a}`
  const isBusy = !!busy
  const n = r.next
  const nextText =
    n.block === 'paused' ? 'Held: paused'
    : n.block === 'no_account' ? 'Held: no Wise account yet'
    : n.block === 'account_hold' ? `Held: new account, from ${shortDay(n.holdUntilDay ?? n.day)}`
    : n.block === 'below_minimum' ? `${usd(n.amountCents)}, under US$1, waits`
    : n.amountCents > 0 ? `${usd(n.amountCents)} on ${dayText(n.day, { weekday: true })}`
    : 'Nothing due'

  return (
    <li className={isNew ? 'adm-card adm-ref-card is-new' : 'adm-card adm-ref-card'} ref={cardRef} id={`${id}-card`}>
      <div className="adm-card-in">
        <div className="adm-card-head">
          <div className="adm-card-main">
            <div className="adm-title-row">
              <h3 className="adm-h3" id={`referrer-${r.id}-h`} tabIndex={-1}>{r.name}{r.business ? <span className="adm-quiet">, {r.business}</span> : null}</h3>
              <span className={cls}>{label}</span>
              <span className="adm-badge adm-badge--plain">{percentText(r.percent)}</span>
            </div>
            <div className="adm-contact" style={{ marginTop: 4 }}>
              <a className="adm-inline-link" href={`mailto:${r.email}`}>{r.email}</a>
            </div>
          </div>
        </div>

        <dl className="adm-facts" style={{ marginTop: 12 }}>
          <div className="adm-fact"><dt className="adm-fact-k">Invited</dt><dd className="adm-fact-v">{stamp(r.invitedAt)}{r.inviteSentAt ? `, email sent ${stamp(r.inviteSentAt)}` : ', email NOT sent yet'}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Set up</dt><dd className="adm-fact-v">{r.acceptedAt ? `Agreed to the terms ${stamp(r.acceptedAt)}` : 'Not yet'}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Paid into</dt><dd className="adm-fact-v">{r.account ? `Wise account ending ${r.account.last4}, ${r.account.holder}${r.account.onHold && r.account.holdUntil ? `, held until ${stamp(r.account.holdUntil)}` : ''}` : 'No Wise account yet'}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Next payout</dt><dd className="adm-fact-v">{nextText}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Bookings</dt><dd className="adm-fact-v">{r.totals.bookings} counted, guests paid {usd(r.totals.guestSpendCents)}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Earned</dt><dd className="adm-fact-v">{usd(r.totals.earnedCents)}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Paid</dt><dd className="adm-fact-v">{usd(r.totals.paidCents)}</dd></div>
          <div className="adm-fact"><dt className="adm-fact-k">Owed</dt><dd className="adm-fact-v">{usd(r.totals.owedCents)}</dd></div>
        </dl>

        {r.status !== 'removed' && (
          <div className="adm-actions" style={{ marginTop: 16 }}>
            {r.status === 'invited' && (
              <button type="button" className="adm-btn adm-btn--sm" aria-busy={busy === k('resend') || undefined} aria-disabled={isBusy || undefined}
                onClick={() => !isBusy && run(k('resend'), 'PATCH', { action: 'resend', id: r.id })}>{r.inviteSentAt ? 'Send the invitation again' : 'Send the invitation'}</button>
            )}
            {r.status === 'paused' ? (
              <button type="button" className="adm-btn adm-btn--sm" aria-disabled={isBusy || undefined} onClick={() => !isBusy && run(k('resume'), 'PATCH', { action: 'status', id: r.id, status: 'active' })}>Resume</button>
            ) : confirm === 'pause' || r.status === 'invited' ? null : (
              <button type="button" className="adm-btn adm-btn--sm" aria-disabled={isBusy || undefined} onClick={() => setConfirm('pause')}>Pause</button>
            )}
            {confirm !== 'remove' && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" aria-disabled={isBusy || undefined} onClick={() => setConfirm('remove')}>{r.status === 'invited' ? 'Cancel the invitation' : 'Remove'}</button>}
          </div>
        )}
        {confirm && (
          <div className="adm-ask" style={{ marginTop: 12 }} role="group" aria-label={confirm === 'remove' ? `Remove ${r.name}` : `Pause ${r.name}`}>
            <p className="adm-h4--ask">{confirm === 'remove' ? (r.status === 'invited' ? `Cancel ${r.name}'s invitation?` : `Remove ${r.name}?`) : `Pause ${r.name}?`}</p>
            <p className="adm-help adm-help--soft">
              {confirm === 'remove' && r.status === 'invited'
                ? 'The invitation link stops working: signing in with that address no longer opens a referral page. You can invite the address again later.'
                : confirm === 'remove'
                ? `Their codes stop working for good and they can no longer open their page. ${r.totals.owedCents > 0 ? `The ${usd(r.totals.owedCents)} they have earned or have coming is still paid on its Monday, as the terms promise, unless you mark those bookings not counted first.` : 'Nothing is owed to them.'}`
                : 'Their codes stop working at checkout and their payouts wait until you resume. They can still see their page.'}
            </p>
            <div className="adm-actions">
              <button type="button" className={confirm === 'remove' ? 'adm-btn adm-btn--bad' : 'adm-btn adm-btn--primary'} aria-disabled={isBusy || undefined}
                onClick={async () => { if (isBusy) return; await run(k(confirm), 'PATCH', { action: 'status', id: r.id, status: confirm === 'remove' ? 'removed' : 'paused' }); setConfirm(null) }}>
                {confirm === 'remove' ? (r.status === 'invited' ? 'Cancel the invitation' : 'Remove for good') : 'Pause'}
              </button>
              <button type="button" className="adm-link" onClick={() => setConfirm(null)}>Keep as is</button>
            </div>
          </div>
        )}

        <details className="adm-details" style={{ marginTop: 8 }}>
          <summary>Rate, codes ({r.codes.filter((c) => c.state !== 'retired').length} live), bookings ({r.earnings.length}), payouts ({r.payouts.length}) and history</summary>
        {r.status !== 'removed' && (
            <div className="adm-actions" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: '0 1 10rem' }}>
                <label className="adm-label" htmlFor={`${id}-rate`}>Rate (%)</label>
                <input id={`${id}-rate`} className="adm-input" type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-describedby={`${id}-rate-h`} />
              </div>
              <button type="button" className="adm-btn adm-btn--sm" aria-disabled={isBusy || Number(rate) === r.percent || undefined}
                onClick={() => !isBusy && Number(rate) !== r.percent && run(k('rate'), 'PATCH', { action: 'rate', id: r.id, percent: rate })}>Save rate</button>
              <p id={`${id}-rate-h`} className="adm-help" style={{ flexBasis: '100%', marginTop: 0 }}>For bookings paid from now on. Bookings already paid keep the rate they were paid at.</p>
            </div>
          )}
          <CodesBlock r={r} busy={busy} run={run} report={report} />
          <EarningsBlock r={r} busy={busy} run={run} />
          <PayoutsBlock r={r} busy={busy} run={run} />
          <div style={{ marginTop: 20 }}>
            <label className="adm-label" htmlFor={`${id}-note`}>Note (only admins see it)</label>
            <textarea id={`${id}-note`} className="adm-input adm-textarea" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            <div className="adm-actions" style={{ marginTop: 8 }}>
              <button type="button" className="adm-btn adm-btn--sm" aria-disabled={isBusy || note === (r.note ?? '') || undefined}
                onClick={() => !isBusy && note !== (r.note ?? '') && run(k('note'), 'PATCH', { action: 'note', id: r.id, note })}>Save note</button>
            </div>
          </div>
          <h4 className="adm-h4" style={{ marginTop: 20 }}>History</h4>
          {r.events.length === 0 ? <p className="adm-help">Nothing yet.</p> : (
            <dl className="adm-facts" style={{ marginTop: 8 }}>
              {r.events.map((ev, i) => (
                <div key={i} className="adm-fact">
                  <dt className="adm-fact-k">{stamp(ev.at)}</dt>
                  <dd className="adm-fact-v">{(EVENT_TEXT[ev.kind] ?? (() => ev.kind.replace(/_/g, ' ')))(ev.detail ?? {})}{ev.actor ? <span className="adm-quiet">, by {ev.actor}</span> : null}</dd>
                </div>
              ))}
            </dl>
          )}
        </details>
      </div>
    </li>
  )
}

function CodesBlock({ r, busy, run, report }: { r: AdminReferrerView; busy: string | null; run: Run; report: Report }) {
  const [retiring, setRetiring] = useState<string | null>(null)
  if (!r.codes.length) return <p className="adm-help" style={{ marginTop: 12 }}>No codes yet.</p>
  const badge = (c: CodeView) => c.state === 'active' ? ['adm-badge adm-badge--ok', 'Live'] : c.state === 'held' ? ['adm-badge adm-badge--warn', 'Held by MAPL'] : c.state === 'paused' ? ['adm-badge adm-badge--plain', 'Paused by them'] : ['adm-badge adm-badge--plain', 'Retired']
  return (
    <>
      <h4 className="adm-h4" style={{ marginTop: 16 }}>Codes</h4>
      <ul className="adm-list">
        {r.codes.map((c) => {
          const [cls, text] = badge(c)
          return (
            <li key={c.id} className="adm-panel">
              <div className="adm-title-row">
                <strong className="adm-tnum" style={{ letterSpacing: '0.06em' }}>{c.code}</strong>
                <CopyButton text={c.code} report={report} />
                <span className={cls}>{text}</span>
                {c.label && <span className="adm-quiet">{c.label}</span>}
              </div>
              <p className="adm-help adm-help--soft">{c.bookings} booking{c.bookings === 1 ? '' : 's'}, guests saved {usd(c.guestsSavedCents)}, earned {usd(c.earnedCents)} ({usd(c.paidCents)} paid)</p>
              {c.state !== 'retired' && r.status !== 'removed' && (
                <div className="adm-actions" style={{ marginTop: 8 }}>
                  {c.state === 'held'
                    ? <button type="button" className="adm-btn adm-btn--sm" aria-disabled={!!busy || undefined} onClick={() => !busy && run(`${c.id}:release`, 'PATCH', { action: 'code', id: r.id, codeId: c.id, op: 'release' })}>Release</button>
                    : <button type="button" className="adm-btn adm-btn--sm" aria-disabled={!!busy || undefined} onClick={() => !busy && run(`${c.id}:hold`, 'PATCH', { action: 'code', id: r.id, codeId: c.id, op: 'hold' })}>Hold this code</button>}
                  {retiring !== c.id && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setRetiring(c.id)}>Retire</button>}
                </div>
              )}
              {retiring === c.id && (
                <div className="adm-ask" style={{ marginTop: 8 }} role="group" aria-label={`Retire ${c.code}`}>
                  <p className="adm-h4--ask">Retire {c.code} for good?</p>
                  <p className="adm-help adm-help--soft">Guests can no longer use it, nobody can ever take it again, and the referrer cannot bring it back. What it has earned stays.</p>
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-btn--bad adm-btn--sm" aria-disabled={!!busy || undefined}
                      onClick={async () => { if (busy) return; await run(`${c.id}:retire`, 'PATCH', { action: 'code', id: r.id, codeId: c.id, op: 'retire' }); setRetiring(null) }}>Retire for good</button>
                    <button type="button" className="adm-link" onClick={() => setRetiring(null)}>Keep it</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

const EARNING_BADGE: Record<EarningView['status'], [string, string]> = {
  upcoming: ['adm-badge adm-badge--plain', 'Trip ahead'],
  ready: ['adm-badge adm-badge--ok', 'Ready to pay'],
  sending: ['adm-badge adm-badge--warn', 'Being paid'],
  paid: ['adm-badge adm-badge--ok', 'Paid'],
  held: ['adm-badge adm-badge--warn', 'Refund asked'],
  cancelled: ['adm-badge adm-badge--plain', 'Refunded'],
  void: ['adm-badge adm-badge--plain', 'Not counted'],
  check: ['adm-badge adm-badge--bad', 'Check'],
}

function EarningsBlock({ r, busy, run }: { r: AdminReferrerView; busy: string | null; run: Run }) {
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  if (!r.earnings.length) return <p className="adm-help" style={{ marginTop: 12 }}>No bookings with their codes yet.</p>
  return (
    <>
      <h4 className="adm-h4" style={{ marginTop: 20 }}>Bookings</h4>
      <ul className="adm-list">
        {r.earnings.map((e) => {
          const [cls, text] = EARNING_BADGE[e.status]
          // A refunded booking already earns nothing, so there is nothing to not count.
          const canVoid = e.status !== 'paid' && e.status !== 'sending' && e.status !== 'void' && e.status !== 'cancelled'
          return (
            <li key={e.id} className="adm-panel">
              <div className="adm-title-row">
                <Link className="adm-inline-link" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }} href={`/admin/bookings?booking=${e.bookingId}`}>{e.ref}</Link>
                <span className={cls}>{text}</span>
                {e.paidThenRefunded && <span className="adm-badge adm-badge--bad">Paid, then refunded</span>}
                {e.recordedLate && <span className="adm-badge adm-badge--plain">Recorded late</span>}
              </div>
              <p className="adm-help adm-help--soft">
                {e.what}, {e.days}. Code {e.code}. Guest paid {usd(e.guestPaidCents)}; commission {usd(e.commissionCents)} at {percentText(e.percent)}{e.capped ? ', capped at what MAPL keeps' : ''}.
                {e.payDay && (e.status === 'upcoming' || e.status === 'ready') ? ` Paid ${dayText(e.payDay, { weekday: true })}.` : ''}
                {e.paidDay ? ` Paid ${dayText(e.paidDay)}.` : ''}
                {e.status === 'cancelled' ? ' The booking was refunded, so this commission is not owed.' : ''}
                {e.note ? ` Not counted: ${/[.!?]$/.test(e.note) ? e.note : `${e.note}.`}` : ''}
              </p>
              {canVoid || e.status === 'void' ? (
                voiding === e.id ? (
                  <div className="adm-ask" style={{ marginTop: 8 }}>
                    <label className="adm-label" htmlFor={`void-${e.id}`}>Why is it not counted? The referrer reads this.</label>
                    <input id={`void-${e.id}`} className="adm-input" value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)} placeholder="For example, your own booking" />
                    <div className="adm-actions">
                      <button type="button" className="adm-btn adm-btn--bad adm-btn--sm" aria-disabled={!!busy || !reason.trim() || undefined}
                        onClick={async () => { if (busy || !reason.trim()) return; const res = await run(`${e.id}:void`, 'PATCH', { action: 'earning', earningId: e.id, void: true, reason }); if (res.ok) { setVoiding(null); setReason('') } }}>Do not count it</button>
                      <button type="button" className="adm-link" onClick={() => { setVoiding(null); setReason('') }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="adm-actions" style={{ marginTop: 8 }}>
                    {canVoid && <button type="button" className="adm-btn adm-btn--sm" onClick={() => { setVoiding(e.id); setReason('') }}>Do not count</button>}
                    {e.status === 'void' && <button type="button" className="adm-btn adm-btn--sm" aria-disabled={!!busy || undefined} onClick={() => !busy && run(`${e.id}:restore`, 'PATCH', { action: 'earning', earningId: e.id, void: false })}>Count it again</button>}
                  </div>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

const PAYOUT_BADGE: Record<PayoutView['state'], [string, string]> = {
  sent: ['adm-badge adm-badge--ok', 'Sent'],
  on_its_way: ['adm-badge adm-badge--warn', 'In progress'],
  needs_attention: ['adm-badge adm-badge--bad', 'Needs a look'],
  returned: ['adm-badge adm-badge--bad', 'Came back'],
  failed: ['adm-badge adm-badge--plain', 'Not sent'],
}

function PayoutsBlock({ r, busy, run }: { r: AdminReferrerView; busy: string | null; run: Run }) {
  const [resolving, setResolving] = useState<string | null>(null)
  if (!r.payouts.length) return <p className="adm-help" style={{ marginTop: 12 }}>No payouts yet.</p>
  return (
    <>
      <h4 className="adm-h4" style={{ marginTop: 20 }}>Payouts</h4>
      <ul className="adm-list">
        {r.payouts.map((p) => {
          const [cls, text] = PAYOUT_BADGE[p.state]
          const open = (p.state === 'needs_attention' || p.state === 'returned') && !p.resolved
          return (
            <li key={p.id} className="adm-panel">
              <div className="adm-title-row">
                <strong className="adm-tnum">{usd(p.amountCents)}</strong>
                <span className={cls}>{text}{p.resolved ? ', resolved' : ''}</span>
                <span className="adm-quiet">{dayText(p.day)}, {p.trips} trip{p.trips === 1 ? '' : 's'}, to the Wise account ending {p.last4}{p.transferId ? `, transfer ${p.transferId}` : ''}</span>
              </div>
              {p.error && <p className="adm-help adm-help--warn">{p.error}</p>}
              {open && resolving !== p.id && (
                <div className="adm-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setResolving(p.id)}>I have checked it in Wise</button>
                </div>
              )}
              {open && resolving === p.id && p.state === 'returned' && (
                <div className="adm-ask" style={{ marginTop: 8 }} role="group" aria-label="Mark the returned payout resolved">
                  <p className="adm-h4--ask">Mark it resolved?</p>
                  <p className="adm-help adm-help--soft">The money came back to our balance, so these commissions are owed again. Mark it resolved once {r.name} has put the right Wise account on their page; the next run then pays them.</p>
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" aria-disabled={!!busy || undefined}
                      onClick={async () => { if (busy) return; const res = await run(`${p.id}:resolve`, 'PATCH', { action: 'resolve_payout', payoutId: p.id }); if (res.ok) setResolving(null) }}>Mark resolved</button>
                    <button type="button" className="adm-link" onClick={() => setResolving(null)}>Not yet</button>
                  </div>
                </div>
              )}
              {open && resolving === p.id && p.state !== 'returned' && (
                <div className="adm-ask" style={{ marginTop: 8 }} role="group" aria-label="What Wise shows for this payout">
                  <p className="adm-h4--ask">What does Wise show?</p>
                  <p className="adm-help adm-help--soft">
                    {p.transferId
                      ? `Look at transfer ${p.transferId} in Wise. Your answer is checked with Wise before it is saved, and a transfer still waiting for our money is cancelled there first.`
                      : `There is no transfer on our side. Look in Wise for a payment of ${usd(p.amountCents)} to the account ending ${p.last4} on ${dayText(p.day)}.`}
                    {' '}Paid: these commissions count as paid and {r.name} gets the payout email. Not paid: the next run pays them.
                  </p>
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" aria-disabled={!!busy || undefined}
                      onClick={async () => { if (busy) return; const res = await run(`${p.id}:resolve`, 'PATCH', { action: 'resolve_payout', payoutId: p.id, outcome: 'paid' }); if (res.ok) setResolving(null) }}>It was paid</button>
                    <button type="button" className="adm-btn adm-btn--sm" aria-disabled={!!busy || undefined}
                      onClick={async () => { if (busy) return; const res = await run(`${p.id}:resolve`, 'PATCH', { action: 'resolve_payout', payoutId: p.id, outcome: 'not_paid' }); if (res.ok) setResolving(null) }}>It was not paid</button>
                    <button type="button" className="adm-link" onClick={() => setResolving(null)}>Not yet</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
