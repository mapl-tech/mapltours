'use client'

import { useMemo, useRef, useState } from 'react'
import {
  checkPayoutAccount, COMMON_COUNTRIES, COUNTRY_RULES,
  type PayoutAccountInput, type PayoutField,
} from '@/lib/referrals/payout-account'

/**
 * The Wise US-dollar account a referrer is paid into
 * (lib/referrals/payout-account has the rules; the server decides,
 * lib/referrals/payout-server). The form asks exactly what Wise asks for the
 * country chosen, says where each figure is in the Wise app, checks as the
 * referrer goes (the routing number's own checksum, the account number typed
 * twice), and on Save sends it once.
 *
 * The account and routing numbers live only in this form's state until Save,
 * are never autofilled or remembered by the browser (autocomplete off), are
 * marked for any session recorder to skip (data-hj-suppress; the referral
 * pages load no recorder at all), and are cleared once Wise has them.
 */

type Values = Record<PayoutField, string>

const EMPTY: Values = {
  legalType: 'PRIVATE', holderName: '', routingNumber: '', accountNumber: '', accountNumberConfirm: '',
  accountType: 'CHECKING', country: 'JM', state: '', city: '', street: '', postCode: '',
}

const ORDER: PayoutField[] = ['legalType', 'holderName', 'routingNumber', 'accountNumber', 'accountNumberConfirm', 'accountType', 'country', 'state', 'street', 'city', 'postCode']

export interface SaveOutcome { ok: boolean; errors?: Partial<Record<PayoutField, string>> | null; message?: string | null; reauth?: boolean }

export default function PayoutAccountForm(props: {
  defaultHolder: string
  changing: boolean
  onSave: (values: PayoutAccountInput) => Promise<SaveOutcome>
  onCancel?: () => void
}) {
  const [v, setV] = useState<Values>({ ...EMPTY, holderName: props.defaultHolder })
  const [touched, setTouched] = useState<Partial<Record<PayoutField, boolean>>>({})
  const [server, setServer] = useState<Partial<Record<PayoutField, string>>>({})
  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refs = useRef<Partial<Record<PayoutField, HTMLElement | null>>>({})
  const summaryRef = useRef<HTMLParagraphElement>(null)

  const rule = COUNTRY_RULES[v.country]
  const local = useMemo(() => {
    const r = checkPayoutAccount(v)
    return r.ok ? {} : r.errors
  }, [v])
  const errorOf = (f: PayoutField): string | undefined => server[f] ?? (touched[f] ? local[f] : undefined)

  const countries = useMemo(() => {
    const all = Object.entries(COUNTRY_RULES).map(([code, r]) => ({ code, name: r.n }))
    const common = COMMON_COUNTRIES.map((c) => all.find((x) => x.code === c)!).filter(Boolean)
    return { common, rest: all.filter((x) => !COMMON_COUNTRIES.includes(x.code)) }
  }, [])

  const set = (f: PayoutField, value: string) => {
    setV((old) => {
      const next = { ...old, [f]: value }
      // A new country brings its own address rules: a state or post code from the old one never carries over.
      if (f === 'country') { next.state = ''; next.postCode = '' }
      return next
    })
    if (server[f]) setServer((s) => { const n = { ...s }; delete n[f]; return n })
  }
  const touch = (f: PayoutField) => setTouched((t) => (t[f] ? t : { ...t, [f]: true }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setSummary(null)
    const all = Object.fromEntries(ORDER.map((f) => [f, true])) as Record<PayoutField, boolean>
    setTouched(all)
    const check = checkPayoutAccount(v)
    if (!check.ok) {
      const first = ORDER.find((f) => check.errors[f])
      setSummary('Check the details marked above.')
      if (first) refs.current[first]?.focus()
      return
    }
    setBusy(true)
    const out = await props.onSave({ ...v, state: v.state || undefined, postCode: v.postCode || undefined } as PayoutAccountInput)
    setBusy(false)
    if (out.ok) {
      // Wise has them now: nothing of the account stays on the page.
      setV((old) => ({ ...old, routingNumber: '', accountNumber: '', accountNumberConfirm: '' }))
      return
    }
    setServer(out.errors ?? {})
    setSummary(out.message ?? 'That did not save. Nothing changed.')
    const first = ORDER.find((f) => out.errors?.[f])
    requestAnimationFrame(() => {
      if (first) refs.current[first]?.focus()
      else summaryRef.current?.focus()
    })
  }

  const field = (f: PayoutField, label: string, hint: string | null, input: React.ReactNode) => {
    const err = errorOf(f)
    return (
      <div className="ref-field">
        <label className="ref-label" htmlFor={`ref-${f}`}>{label}</label>
        {hint && <p className="ref-hint" id={`ref-${f}-hint`}>{hint}</p>}
        {input}
        {err && <p className="ref-error" id={`ref-${f}-err`}>{err}</p>}
      </div>
    )
  }
  const aria = (f: PayoutField, hint: boolean) => ({
    id: `ref-${f}`,
    'aria-invalid': errorOf(f) ? (true as const) : undefined,
    'aria-describedby': [hint ? `ref-${f}-hint` : '', errorOf(f) ? `ref-${f}-err` : ''].filter(Boolean).join(' ') || undefined,
    ref: (el: HTMLElement | null) => { refs.current[f] = el },
    onBlur: () => touch(f),
  })
  const secret = { autoComplete: 'off', autoCorrect: 'off', spellCheck: false, inputMode: 'numeric' as const, 'data-hj-suppress': '', 'data-1p-ignore': '', 'data-lpignore': 'true' }

  const stateLabel = v.country === 'CA' ? 'Province' : 'State'
  const pcLabel = v.country === 'US' ? 'ZIP code' : 'Post code'

  return (
    <form className="ref-form" onSubmit={submit} noValidate aria-label="Your Wise US-dollar account">
      <p className="ref-secure">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: '0 0 18px', marginTop: 2 }}>
          <path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 2.2 6 2.3V11c0 3.9-2.5 7.6-6 8.9-3.5-1.3-6-5-6-8.9V6.5l6-2.3Zm-1 10.4-2.3-2.3-1.4 1.4 3.7 3.7 6-6-1.4-1.4-4.6 4.6Z" />
        </svg>
        <span>Your bank details go straight to Wise, our payment provider. We keep only the name, the last four digits, and whether it is a personal or business account.</span>
      </p>
      <p className="ref-hint" style={{ marginBottom: 'var(--sp-4)' }}>
        Find these in the Wise app: open your US dollar balance, then Account details.
      </p>

      <fieldset className="ref-fieldset" aria-describedby={errorOf('legalType') ? 'ref-legalType-err' : undefined}>
        <legend>Whose name is the account in?</legend>
        <div className="ref-choices">
          {([['PRIVATE', 'A person'], ['BUSINESS', 'A business']] as const).map(([value, text], i) => (
            <label key={value} className="ref-choice">
              <input type="radio" name="legalType" value={value} checked={v.legalType === value} onChange={() => set('legalType', value)}
                ref={i === 0 ? (el) => { refs.current.legalType = el } : undefined} />
              {text}
            </label>
          ))}
        </div>
        {errorOf('legalType') && <p className="ref-error" id="ref-legalType-err">{errorOf('legalType')}</p>}
      </fieldset>

      {field('holderName', v.legalType === 'BUSINESS' ? "The business's name" : "Account holder's full name", 'Exactly as Wise shows it.',
        <input className="ref-input" type="text" autoComplete={v.legalType === 'BUSINESS' ? 'organization' : 'name'} value={v.holderName}
          onChange={(e) => set('holderName', e.target.value)} {...aria('holderName', true)} />)}

      {field('routingNumber', 'Routing number', '9 digits. Use the routing number for ACH.',
        <input className="ref-input" type="text" maxLength={11} value={v.routingNumber} onChange={(e) => set('routingNumber', e.target.value)} {...secret} {...aria('routingNumber', true)} />)}

      <div className="ref-pair">
        {field('accountNumber', 'Account number', null,
          <input className="ref-input" type="text" maxLength={21} value={v.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} {...secret} {...aria('accountNumber', false)} />)}
        {field('accountNumberConfirm', 'Account number again', null,
          <input className="ref-input" type="text" maxLength={21} value={v.accountNumberConfirm} onChange={(e) => set('accountNumberConfirm', e.target.value)}
            {...secret} {...aria('accountNumberConfirm', false)} />)}
      </div>

      <fieldset className="ref-fieldset">
        <legend>Account type</legend>
        <div className="ref-choices">
          {([['CHECKING', 'Checking'], ['SAVINGS', 'Savings']] as const).map(([value, text]) => (
            <label key={value} className="ref-choice">
              <input type="radio" name="accountType" value={value} checked={v.accountType === value} onChange={() => set('accountType', value)} />
              {text}
            </label>
          ))}
        </div>
        <p className="ref-hint" style={{ marginTop: 'var(--sp-2)' }}>Wise US-dollar accounts are checking accounts.</p>
      </fieldset>

      <fieldset className="ref-fieldset" aria-describedby="ref-address-hint">
      <legend style={{ marginTop: 'var(--sp-2)' }}>The account holder&rsquo;s address</legend>
      <p className="ref-hint" id="ref-address-hint" style={{ marginBottom: 'var(--sp-3)' }}>Wise asks for it with every US-dollar account.</p>

      <div className="ref-pair">
        {field('country', 'Country', null,
          <select className="ref-select" value={v.country} onChange={(e) => set('country', e.target.value)} autoComplete="country" {...aria('country', false)}>
            <optgroup label="Most used">
              {countries.common.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </optgroup>
            <optgroup label="All countries">
              {countries.rest.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </optgroup>
          </select>)}
        {rule && rule.st > 0 && field('state', rule.st === 2 ? stateLabel : `${stateLabel} (optional)`, null,
          <select className="ref-select" value={v.state} onChange={(e) => set('state', e.target.value)} autoComplete="address-level1" {...aria('state', false)}>
            <option value="">Choose</option>
            {(rule.s ?? []).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>)}
      </div>

      {field('street', 'Street address', null,
        <input className="ref-input" type="text" autoComplete="address-line1" value={v.street} onChange={(e) => set('street', e.target.value)} {...aria('street', false)} />)}

      <div className="ref-pair">
        {field('city', 'Town or city', null,
          <input className="ref-input" type="text" autoComplete="address-level2" value={v.city} onChange={(e) => set('city', e.target.value)} {...aria('city', false)} />)}
        {rule && rule.pc > 0 && field('postCode', pcLabel, null,
          <input className="ref-input" type="text" autoComplete="postal-code" value={v.postCode} onChange={(e) => set('postCode', e.target.value)}
            inputMode={v.country === 'US' || v.country === 'AU' ? 'numeric' : 'text'} {...aria('postCode', false)} />)}
      </div>
      </fieldset>

      <p ref={summaryRef} tabIndex={-1} className={summary ? 'ref-status ref-status--error' : 'ref-status'} role="alert">{summary ?? ''}</p>
      <div className="ref-actions ref-actions--stack" style={{ marginTop: 'var(--sp-4)' }}>
        <button type="submit" className="btn-primary ref-btn" aria-disabled={busy || undefined} data-busy={busy ? '' : undefined}>
          {busy ? 'Checking with Wise' : props.changing ? 'Save the new account' : 'Save my Wise account'}
        </button>
        {props.onCancel && <button type="button" className="ref-text-btn" onClick={props.onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
