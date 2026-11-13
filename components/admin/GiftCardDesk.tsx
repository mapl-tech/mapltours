'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { count, money, stamp } from '@/lib/admin-format'
import { CopyButton, focusIsWithin, useBusy, useClosing, useResultNote, type Note } from '@/components/admin/AdminUi'

/**
 * Gift-card support desk.
 *
 * Built around the questions support actually gets asked, in order of how
 * often they come up: "it never arrived", "I sent it to the wrong address",
 * "how much is left on it", "cancel it".
 *
 * The Nov 13 2026 redesign moved it onto the shared .adm system and made it
 * safe: each card offers only what its state allows (the server refuses the
 * rest, and two of the old offers could lose money: voiding an unpaid card
 * strands its payment, because a card only activates from pending, and
 * reviving a never-paid card would make its full balance spendable); Void and
 * Reactivate ask first; after a send the desk says what the server reports,
 * never "re-sent" by default; times are the owner's clock with the zone
 * named. The requests and their bodies are unchanged. Styles: the .adm-gc
 * block in app/globals.css.
 */

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

type State = 'active' | 'expired' | 'pending' | 'depleted' | 'void'
type Emails = { recipient?: 'sent' | 'skipped' | 'failed'; purchaser?: string } | undefined

const STATE: Record<State, { cls: string; label: string }> = {
  active: { cls: 'adm-badge--ok', label: 'Live' },
  expired: { cls: 'adm-badge--plain', label: 'Expired' },
  pending: { cls: 'adm-badge--warn', label: 'Not paid' },
  depleted: { cls: 'adm-badge--plain', label: 'Used up' },
  void: { cls: 'adm-badge--bad', label: 'Void' },
}

/** A card's state as checkout would meet it. Exported for tests/unit/gift-card-desk.spec.tsx. */
export function cardState(c: Pick<Card, 'status' | 'expires_at'>, now = Date.now()): State {
  if (c.status === 'void') return 'void'
  if (c.status === 'pending') return 'pending'
  if (c.status === 'depleted') return 'depleted'
  if (c.expires_at && Date.parse(c.expires_at) < now) return 'expired'
  return 'active'
}

/**
 * What can be done with a card in its state. Re-send and Void only while it
 * can be spent; a new address while it is spendable or still waiting for its
 * payment (it then goes to the new address); Reactivate only for a void card
 * that was paid for and still holds money.
 */
export function actionsFor(c: Pick<Card, 'status' | 'expires_at' | 'paid_at' | 'balance'>, now = Date.now()) {
  const s = cardState(c, now)
  return {
    resend: s === 'active',
    fix: s === 'active' || s === 'pending',
    void: s === 'active',
    reactivate: s === 'void' && !!c.paid_at && Number(c.balance) > 0,
  }
}

/** What to tell the owner after a send, from what the server reports. Never "sent" unless it was. */
export function sendResult(
  action: 'resend' | 'correct_email',
  c: Pick<Card, 'code' | 'recipient_email' | 'status' | 'delivered_at'>,
  data: { emails?: Emails; recipientEmail?: string },
): Note {
  const r = data.emails?.recipient
  if (action === 'correct_email') {
    const to = data.recipientEmail ?? ''
    if (r === 'sent') return { text: `Address changed to ${to}, and ${c.code} was sent there.` }
    if (r === 'failed') return { text: `Address changed to ${to}, but the email did not go out. Use Re-send in a minute.`, bad: true }
    if (c.status === 'pending') return { text: `Address changed to ${to}. ${c.code} goes there once its payment completes.` }
    return { text: `Address changed to ${to}, but ${c.code} was already being sent, perhaps to the old address. Use Re-send in a minute to be sure.`, bad: true }
  }
  if (r === 'sent') return { text: `${c.code} was sent${c.delivered_at ? ' again' : ''} to ${c.recipient_email}.` }
  if (r === 'failed') return { text: `The email to ${c.recipient_email} did not go out. Try Re-send again in a minute.`, bad: true }
  return { text: `Nothing new was sent: ${c.code} was already being sent.`, bad: true }
}

function amountIn(currency: string | null | undefined) {
  const cur = (currency || 'USD').toUpperCase()
  return (n: number | string) => (cur === 'USD' ? money(Number(n)) : `${cur} ${money(Number(n)).replace('$', '')}`)
}

/** The balance in words that fit the state: only a spendable card has money "left". Exported for tests. */
export function balanceWords(c: Pick<Card, 'status' | 'expires_at' | 'balance' | 'initial_amount' | 'currency'>, now = Date.now()): { lead: string; rest: string } {
  const amt = amountIn(c.currency)
  const s = cardState(c, now)
  if (s === 'pending') return { lead: `${amt(c.initial_amount)} once paid`, rest: '' }
  if (s === 'void') return { lead: `${amt(c.balance)} frozen`, rest: ` of ${amt(c.initial_amount)}` }
  if (s === 'expired') return { lead: `${amt(c.balance)} unspent`, rest: ` of ${amt(c.initial_amount)}` }
  return { lead: `${amt(c.balance)} left`, rest: ` of ${amt(c.initial_amount)}` }
}

function person(name: string | null, email: string | null) {
  if (!email) return name || null
  return name ? `${name}, ${email}` : email
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="adm-fact">
      <dt className="adm-fact-k">{k}</dt>
      <dd className="adm-fact-v">{v}</dd>
    </div>
  )
}

export default function GiftCardDesk() {
  const [q, setQ] = useState('')
  // What the list shows: the cards that need attention (null) until the first
  // search, then that search; a refresh after an action reloads the same
  // list, never a half-typed box.
  const [searched, setSearched] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  // What is on the wire: a search the owner asked for, or the delivery check.
  const [pending, setPending] = useState<'search' | 'attention' | null>('attention')
  // Only the latest request may fill the list (a late delivery check never
  // overwrites a search, nor a late search an emptied box); `wanted` is what
  // that latest request asked for.
  const seq = useRef(0)
  const wanted = useRef<string | null>(null)
  const { busy, start, end } = useBusy()
  const [asking, setAsking] = useState<{ id: string; what: 'void' | 'reactivate' } | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  // A refusal belongs to the card whose address was being fixed, never to another card's form.
  const [fixError, setFixError] = useState<{ id: string; text: string } | null>(null)
  const { setNote, keepClear, toast } = useResultNote()
  const leave = useClosing()
  const motion = (key: string) => (leave.closing === key ? 'adm-leave' : 'adm-enter')
  const searchId = useId()
  // Where focus goes once React has committed the change that showed or hid
  // it: the first of these ids that exists.
  const focusNext = useRef<string[] | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    const el = focusNext.current.map((id) => document.getElementById(id)).find(Boolean)
    focusNext.current = null
    el?.focus()
  })

  /** A search, or (null) the paid cards whose email never went out. */
  const run = useCallback(async (query: string | null) => {
    const mine = ++seq.current
    wanted.current = query
    setPending(query === null ? 'attention' : 'search')
    try {
      const res = await fetch(query === null ? '/api/admin/gift-cards?attention=1' : `/api/admin/gift-cards?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (mine !== seq.current) return false
      if (!res.ok) {
        setNote({ text: data.error === 'unauthorized' ? 'Your session ended. Sign in again.' : data.error ?? (query === null ? 'Could not check deliveries.' : 'Search failed. Please try again.'), bad: true })
        return false
      }
      const found: Card[] = data.cards ?? []
      setCards(found)
      setSearched(query)
      return found
    } catch {
      if (mine === seq.current) setNote({ text: query === null ? 'Could not check deliveries. Please reload.' : 'Search failed. Please try again.', bad: true })
      return false
    } finally {
      if (mine === seq.current) setPending(null)
    }
  }, [setNote])

  // On arrival: the delivery check, its outcome spoken as well as shown.
  useEffect(() => {
    void run(null).then((found) => {
      if (!found) return
      setNote({ text: found.length ? (found.length === 1 ? '1 paid card was never delivered.' : `${found.length} paid cards were never delivered.`) : 'Every paid card has been delivered.', quiet: true })
    })
  }, [run, setNote])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query || pending === 'search') return
    setNote(null); setAsking(null); setFixing(null)
    const found = await run(query)
    if (found) setNote({ text: found.length ? `${count(found.length, 'card')} found.` : 'Nothing matched.', quiet: true })
  }

  async function act(c: Card, action: 'resend' | 'correct_email' | 'void' | 'reactivate', email?: string) {
    if (busy[c.id]) return
    start(c.id, action)
    setNote(null)
    if (action === 'correct_email') setFixError(null)
    try {
      const res = await fetch('/api/admin/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, action, email }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? 'That did not work.'
        if (action === 'correct_email') setFixError({ id: c.id, text: msg })
        else setNote({ text: msg, bad: true })
        return
      }
      const amt = amountIn(c.currency)
      setNote(
        action === 'resend' || action === 'correct_email' ? sendResult(action, c, data)
        : action === 'void' ? { text: data.changed === false ? `${c.code} was already void.` : `${c.code} is void. Nobody can spend it.` }
        : { text: data.changed === false ? `${c.code} was not void, so nothing changed.` : `${c.code} works again, with ${amt(c.balance)} to spend.` },
      )
      // This card's panel is done; focus lands on the card itself (or, if a
      // delivered card leaves the needs-attention list, on its neighbour),
      // unless the owner has moved on to something else while the request
      // was out. A panel open on another card stays open.
      const list = cards ?? []
      const i = list.findIndex((x) => x.id === c.id)
      const near = list[i + 1]?.id ?? list[i - 1]?.id
      const back = [`gift-${c.id}-h`, ...(near ? [`gift-${near}-h`] : []), 'gc-h1']
      if (focusIsWithin(`gift-${c.id}`)) focusNext.current = back
      setAsking((a) => (a?.id === c.id ? null : a))
      setFixing((f) => (f === c.id ? null : f))
      await run(searched)
      if (focusIsWithin(`gift-${c.id}`)) focusNext.current = back
    } catch {
      if (action === 'correct_email') setFixError({ id: c.id, text: 'That did not work. Please try again.' })
      else setNote({ text: 'That did not work. Please try again.', bad: true })
    } finally {
      end(c.id)
    }
  }

  function ask(c: Card, what: 'void' | 'reactivate') {
    setFixing(null)
    focusNext.current = [`ask-${c.id}-h`]
    setAsking({ id: c.id, what })
  }
  function back(c: Card, what: 'void' | 'reactivate') {
    leave.close(`ask-${c.id}`, () => {
      focusNext.current = [`${what}-btn-${c.id}`, `gift-${c.id}-h`]
      setAsking(null)
    })
  }
  function startFix(c: Card) {
    setAsking(null); setFixError(null)
    setNewEmail(c.recipient_email)
    focusNext.current = [`fix-${c.id}-h`]
    setFixing(c.id)
  }
  function stopFix(c: Card) {
    leave.close(`fix-${c.id}`, () => {
      focusNext.current = [`fix-btn-${c.id}`, `gift-${c.id}-h`]
      setFixing(null); setFixError(null)
    })
  }
  const onEscape = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); fn() } }

  return (
    <div className="adm" onFocus={keepClear}>
      <h1 id="gc-h1" tabIndex={-1} className="adm-h1">Gift cards</h1>
      <p className="adm-lead">
        Find a card by its code, or by the email it was sent to or bought with. <strong className="adm-strong">A gift code works like cash:</strong> whoever
        holds it can spend the balance, so keep codes off screens other people can see.
      </p>

      <form className="adm-gc-search" onSubmit={search} role="search">
        <div className="adm-search">
          <label htmlFor={searchId} className="visually-hidden">Search gift cards by code or email</label>
          <Search className="adm-search-icon" size={18} strokeWidth={2.25} aria-hidden />
          <input id={searchId} type="search" className="adm-input adm-search-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="MAPL-XXXX-XXXX or an email" enterKeyHint="search" autoComplete="off" spellCheck={false} required
            onInput={(e) => { if (!e.currentTarget.value && wanted.current !== null) { setNote(null); setAsking(null); setFixing(null); void run(null) } }} />
        </div>
        <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={pending === 'search' || undefined} aria-busy={pending === 'search' || undefined}>{pending === 'search' ? 'Searching…' : 'Search'}</button>
      </form>

      {/* Before a search: the paid cards whose email never went out, or the all-clear. Clearing the box comes back here. */}
      {cards && searched === null && (
        <p className={cards.length ? 'adm-gc-count adm-gc-count--warn' : 'adm-gc-count'}>
          {cards.length
            ? <><strong>{cards.length === 1 ? '1 paid card was never delivered.' : `${cards.length} paid cards were never delivered.`}</strong> Send {cards.length === 1 ? 'it' : 'each one'}, or fix the address first if it looks mistyped.</>
            : 'Every paid card has been delivered. Search for any card by its code or an email.'}
        </p>
      )}

      {cards && searched !== null && (
        <p className="adm-gc-count">
          {cards.length === 0
            ? <>Nothing matched &ldquo;{searched}&rdquo;. Codes look like MAPL-XXXX-XXXX; an email matches the recipient or the buyer.</>
            : <>{count(cards.length, 'card')} for &ldquo;{searched}&rdquo;{cards.length >= 50 ? ', the 50 newest. Search a fuller address to narrow it.' : cards.length > 1 ? ', newest first.' : '.'}</>}
        </p>
      )}

      <ol className="adm-list adm-gc-list">
        {(cards ?? []).map((c) => {
          const s = cardState(c)
          const can = actionsFor(c)
          const amt = amountIn(c.currency)
          const notSent = s === 'active' && !c.delivered_at
          const isBusy = (a: string) => busy[c.id] === a
          const bal = balanceWords(c)
          // Each action names its card for screen readers ("Re-send MAPL-..."); the eye reads "Re-send".
          const code = <span className="visually-hidden"> {c.code}</span>
          const panelOpen = asking?.id === c.id || fixing === c.id
          return (
            <li key={c.id} id={`gift-${c.id}`} className="adm-card adm-gc">
              <div className="adm-card-in">
                <div className="adm-gc-head">
                  <h2 id={`gift-${c.id}-h`} tabIndex={-1} className="adm-code">{c.code}</h2>
                  <CopyButton text={c.code} report={setNote} />
                  <span className={`adm-badge ${STATE[s].cls}`}>{STATE[s].label}</span>
                  {notSent && <span className="adm-badge adm-badge--warn">Not delivered</span>}
                  <span className="adm-gc-bal"><strong>{bal.lead}</strong>{bal.rest}</span>
                </div>

                <dl className="adm-facts adm-gc-facts">
                  <Fact k="To" v={person(c.recipient_name, c.recipient_email)} />
                  <Fact k="From" v={person(c.purchaser_name, c.purchaser_email) ?? 'Not given'} />
                  <Fact k="Paid" v={c.paid_at ? stamp(c.paid_at) : <>Not paid <span className="adm-gc-soft">(ordered {stamp(c.created_at)})</span></>} />
                  <Fact k="Delivered" v={c.delivered_at ? stamp(c.delivered_at) : s === 'pending' ? 'Once it is paid' : notSent ? <strong className="adm-gc-warn">Not yet</strong> : 'Not yet'} />
                  <Fact k="Expires" v={c.expires_at ? stamp(c.expires_at, true) : 'Never'} />
                </dl>

                {c.message && (
                  <figure className="adm-gc-msg">
                    <blockquote><p>{c.message}</p></blockquote>
                    <figcaption>Message from {c.purchaser_name || 'the buyer'}</figcaption>
                  </figure>
                )}

                {!panelOpen && (can.resend || can.fix || can.void || can.reactivate) && (
                  <div className="adm-actions adm-gc-actions">
                    {can.resend && (
                      <button type="button" className={notSent ? 'adm-btn adm-btn--sm adm-btn--primary' : 'adm-btn adm-btn--sm'} aria-busy={isBusy('resend') || undefined} onClick={() => void act(c, 'resend')}>
                        {isBusy('resend') ? 'Sending…' : notSent ? 'Send it now' : 'Re-send'}{code}
                      </button>
                    )}
                    {can.fix && <button id={`fix-btn-${c.id}`} type="button" className="adm-btn adm-btn--sm" onClick={() => startFix(c)}>Fix address{code}</button>}
                    {can.void && <button id={`void-btn-${c.id}`} type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => ask(c, 'void')}>Void{code}</button>}
                    {can.reactivate && <button id={`reactivate-btn-${c.id}`} type="button" className="adm-btn adm-btn--sm" onClick={() => ask(c, 'reactivate')}>Reactivate{code}</button>}
                  </div>
                )}
                {!panelOpen && s === 'void' && !can.reactivate && (
                  <p className="adm-meta">{c.paid_at ? 'Nothing is left on it, so there is nothing to bring back.' : 'It was never paid for, so it cannot be brought back.'}</p>
                )}
                {!panelOpen && s === 'expired' && <p className="adm-meta">It can no longer be spent.</p>}
                {!panelOpen && s === 'depleted' && <p className="adm-meta">Fully spent, so there is nothing to send or stop.</p>}

                {asking?.id === c.id && (
                  <section aria-labelledby={`ask-${c.id}-h`} className={`adm-ask ${motion(`ask-${c.id}`)}`} onAnimationEnd={leave.onEnd} onKeyDown={onEscape(() => back(c, asking.what))}>
                    <h3 id={`ask-${c.id}-h`} tabIndex={-1} className="adm-h4 adm-h4--ask">{asking.what === 'void' ? `Void ${c.code}?` : `Reactivate ${c.code}?`}</h3>
                    <p className="adm-block">
                      {asking.what === 'void'
                        ? `It stops working at once: nobody can spend the ${amt(c.balance)} left. You can reactivate it later.`
                        : `It can be spent again, up to ${amt(c.balance)}. Only do this if its purchase was not refunded or disputed.`}
                    </p>
                    <div className="adm-actions">
                      <button type="button" className={asking.what === 'void' ? 'adm-btn adm-btn--bad' : 'adm-btn adm-btn--primary'}
                        aria-disabled={isBusy(asking.what) || undefined} aria-busy={isBusy(asking.what) || undefined} onClick={() => void act(c, asking.what)}>
                        {asking.what === 'void' ? (isBusy('void') ? 'Voiding…' : 'Yes, void it') : (isBusy('reactivate') ? 'Reactivating…' : 'Yes, reactivate it')}
                      </button>
                      <button type="button" className="adm-btn" onClick={() => back(c, asking.what)}>Back</button>
                    </div>
                  </section>
                )}

                {fixing === c.id && (
                  <form className={`adm-gc-fix ${motion(`fix-${c.id}`)}`} aria-labelledby={`fix-${c.id}-h`} onAnimationEnd={leave.onEnd} onKeyDown={onEscape(() => stopFix(c))}
                    onSubmit={(e) => { e.preventDefault(); void act(c, 'correct_email', newEmail) }}>
                    <h3 id={`fix-${c.id}-h`} tabIndex={-1} className="adm-h4">Fix the address for {c.code}</h3>
                    <div>
                      <label className="adm-label" htmlFor={`fix-${c.id}-in`}>Recipient email</label>
                      <input id={`fix-${c.id}-in`} className="adm-input" type="email" inputMode="email" autoComplete="off" spellCheck={false} required
                        value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-describedby={`fix-${c.id}-help`} />
                      <p id={`fix-${c.id}-help`} className="adm-help">
                        {s === 'pending' ? 'The card goes to this address once its payment completes.' : 'The card is sent to this address as soon as you save.'}
                      </p>
                    </div>
                    {fixError?.id === c.id && <p role="alert" className="adm-error">{fixError.text}</p>}
                    <div className="adm-actions">
                      <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={isBusy('correct_email') || undefined} aria-busy={isBusy('correct_email') || undefined}>
                        {isBusy('correct_email') ? 'Saving…' : s === 'pending' ? 'Save address' : 'Save and send'}
                      </button>
                      <button type="button" className="adm-btn" onClick={() => stopFix(c)}>Cancel</button>
                    </div>
                  </form>
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
