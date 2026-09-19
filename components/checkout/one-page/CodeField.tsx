'use client'

import { useId } from 'react'

/**
 * The code field in the order summary, shared by the tours and the transfers
 * checkout so the two never drift.
 *
 * Always open: a visible label, a 48px field with a button that fills as the
 * guest types, one helper line, and an applied "chip" once a code lands. A
 * coupon and a gift card use the same field (coupon first, then gift), and a
 * guest who has applied a coupon can still add a gift card from the link
 * under the chip. Nothing here computes money: the parent passes the preview
 * it already shares with the server.
 */

const FONT = 'var(--font-dm-sans)'

export interface CodeFieldProps {
  coupon: { code: string; kind: 'percent' | 'fixed'; value: number } | null
  couponPreview: number
  giftCard: { code: string; balanceCents: number } | null
  giftPreview: number
  codeInput: string
  setCodeInput: (v: string) => void
  codeChecking: boolean
  codeError: string | null
  applyCode: () => void
  removeCoupon: () => void
  removeGift: () => void
  formatUsd: (n: number) => string
  /** Whether the field is open under an applied coupon (for a gift card). */
  moreOpen: boolean
  setMoreOpen: (b: boolean) => void
}

export default function CodeField(p: CodeFieldProps) {
  const uid = useId()
  const inputId = `code-${uid}`
  const helpId = `code-help-${uid}`
  const errId = `code-err-${uid}`
  const canApply = !p.codeChecking && p.codeInput.trim().length >= 4
  const fieldOpen = (!p.coupon && !p.giftCard) || p.moreOpen || !!p.codeError
  const label = p.coupon && !p.giftCard ? 'Gift card' : p.giftCard && !p.coupon ? 'Discount code' : 'Discount code or gift card'

  const announcement = p.coupon
    ? `${p.coupon.code} applied, ${p.formatUsd(p.couponPreview)} off.`
    : p.giftCard ? `Gift card ${p.giftCard.code} applied, ${p.formatUsd(p.giftPreview)} off.` : ''

  return (
    <div>
      <div role="status" aria-live="polite" className="visually-hidden">{announcement}</div>
      {p.coupon && (
        <Chip
          title={p.coupon.code}
          detail={p.coupon.kind === 'percent' ? `${p.coupon.value}% off, applied` : `${p.formatUsd(p.coupon.value)} off, applied`}
          amount={`−${p.formatUsd(p.couponPreview)}`}
          removeLabel={`Remove code ${p.coupon.code}`}
          onRemove={p.removeCoupon}
        />
      )}
      {p.giftCard && (
        <Chip
          title={`Gift card ${p.giftCard.code}`}
          detail="Applied to this booking"
          amount={`−${p.formatUsd(p.giftPreview)}`}
          removeLabel={`Remove gift card ${p.giftCard.code}`}
          onRemove={p.removeGift}
        />
      )}

      {fieldOpen && !(p.coupon && p.giftCard) ? (
        <div style={{ marginTop: p.coupon || p.giftCard ? 12 : 0 }}>
          <label htmlFor={inputId} style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
            {label}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id={inputId}
              value={p.codeInput}
              onChange={(e) => p.setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canApply) { e.preventDefault(); p.applyCode() } }}
              placeholder="Enter code"
              className="field-input opc-code-input"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={p.codeError ? errId : helpId}
              aria-invalid={p.codeError ? true : undefined}
              style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, letterSpacing: '0.04em', background: '#fff', textTransform: 'uppercase' }}
            />
            <button type="button" onClick={p.applyCode} disabled={!canApply} className="opc-code-apply" data-ready={canApply} aria-busy={p.codeChecking || undefined}>
              {p.codeChecking ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {p.codeError ? (
            <p id={errId} role="alert" style={{ marginTop: 6, fontFamily: FONT, fontSize: 14, lineHeight: 1.45, color: '#b00020' }}>{p.codeError}</p>
          ) : (
            <p id={helpId} style={{ marginTop: 6, fontFamily: FONT, fontSize: 13, lineHeight: 1.45, color: 'var(--text-tertiary)' }}>
              {p.coupon ? 'Comes off after your code.' : 'Comes off your total before you pay.'}
            </p>
          )}
        </div>
      ) : p.coupon && !p.giftCard ? (
        <button type="button" onClick={() => p.setMoreOpen(true)}
          style={{ background: 'none', border: 'none', padding: '8px 0 0', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
          Have a gift card too?
        </button>
      ) : null}
    </div>
  )
}

function Chip({ title, detail, amount, removeLabel, onRemove }: { title: string; detail: string; amount: string; removeLabel: string; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--emerald-dim)', border: '1px solid rgba(18, 86, 58, 0.22)', marginTop: 0 }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--emerald)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>✓</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 13, color: 'var(--emerald)', fontWeight: 600 }}>{detail}</p>
        <button type="button" onClick={onRemove} aria-label={removeLabel}
          style={{ background: 'none', border: 'none', padding: '10px 8px 6px 0', margin: '-6px 0 -6px', minHeight: 44, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
          Remove
        </button>
      </div>
      <span className="opc-num" style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: 'var(--emerald)', flexShrink: 0 }}>{amount}</span>
    </div>
  )
}
