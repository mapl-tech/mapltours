'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck } from 'lucide-react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'

/**
 * The waiver and the cancellation policy, answered in place.
 *
 * Sending someone to /terms mid-checkout is the one navigation a payment page
 * should never make. A dialog that opens on clause 1 of a legal document is
 * barely better: the reader clicked a link inside a sentence about
 * cancellation, while holding a card, and they want one question answered.
 *
 * So the answer leads, in plain language, pinned under the header and OUTSIDE
 * the scroll area where it cannot be scrolled away, and the clause it
 * paraphrases sits first in the body underneath. The legal text is unchanged
 * and complete; only the order changed.
 */

const ANSWER = {
  // Derived, not typed. This paragraph and the trust line that opens it are
  // the same promise, so they read from the same constant.
  cancellation: CANCELLATION_SUMMARY,
} as const

export default function LegalModal({
  kind,
  onClose,
  answer,
}: {
  kind: 'waiver' | 'terms'
  onClose: () => void
  /**
   * Plain-language answer to pin above the legal text, and the clause to open
   * the body at. Omit it and this is a plain document viewer, which is what
   * the waiver checkbox wants.
   */
  answer?: keyof typeof ANSWER
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)

  const bodyRef = useRef<HTMLDivElement>(null)

  // Sheet below 640px, centred dialog above it. Read from the platform rather
  // than guessed, and kept live so a rotation re-reads it.
  const [isSheet, setIsSheet] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const read = () => setIsSheet(mql.matches)
    read()
    mql.addEventListener('change', read)
    return () => mql.removeEventListener('change', read)
  }, [])

  // Open the body ON the clause the answer paraphrases.
  //
  // Depends on isSheet, not just on `answer`. isSheet starts false and flips
  // in an effect, so the first paint is always the desktop shape: scrolling
  // once on mount measured a layout the sheet was about to replace, and the
  // phone opened a line late every time. Re-running when the shape settles
  // costs one extra frame and is right in both.
  useEffect(() => {
    if (!answer) return
    const frame = requestAnimationFrame(() => {
      const box = bodyRef.current
      const target = box?.querySelector<HTMLElement>(`[data-section="${answer}"]`)
      if (!box || !target) return
      // Rect delta rather than offsetTop, which is measured against the
      // nearest POSITIONED ancestor and so differs between the two shapes.
      box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top
    })
    return () => cancelAnimationFrame(frame)
  }, [answer, isSheet])

  // The checkout behind must not scroll under the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const title = kind === 'waiver' ? 'Activity Waiver & Release of Liability' : 'Cancellation & Terms'
  const a = answer ? ANSWER[answer] : null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(23,22,20,0.55)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        className={isSheet ? 'legal-sheet' : 'legal-dialog'}
        style={{
          position: 'fixed', zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          background: '#fff',
          boxShadow: '0 24px 64px rgba(23,22,20,0.22)',
          ...(isSheet
            ? { left: 0, right: 0, bottom: 0, maxHeight: '88vh', borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0' }
            : {
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 'calc(100% - 48px)', maxWidth: 640, maxHeight: '80vh',
                borderRadius: 'var(--r-2xl)',
              }),
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: isSheet ? '16px 16px' : '20px 24px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}
        >
          <h2
            id="legal-modal-title"
            style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: isSheet ? 17 : 18, lineHeight: 1.3,
              letterSpacing: '-0.01em', margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
              border: '1px solid var(--border)', background: '#fff',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        {/* The answer, pinned outside the scroll box. On a phone the
            risk-reversal is the first thing to fall off the screen, and it is
            the only line most readers came for. */}
        {a && (
          <div style={{ padding: isSheet ? '14px 16px 0' : '16px 24px 0', flexShrink: 0 }}>
            <div
              role="note"
              aria-label="Cancellation summary"
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '14px 16px', borderRadius: 'var(--r-lg)',
                background: 'var(--gold-dim, rgba(166,139,60,0.10))',
                border: '1px solid var(--border)',
              }}
            >
              <ShieldCheck size={17} color="var(--gold-text)" strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
              <span style={{ fontFamily: 'var(--font-dm-sans)' }}>
                <strong style={{ display: 'block', fontSize: 15, lineHeight: 1.45, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {a.lead}
                </strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {a.detail}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Body. tabIndex makes the scroll box reachable by keyboard, without
            which a keyboard-only reader cannot scroll the document they are
            being asked to accept (axe: scrollable-region-focusable). */}
        <div
          ref={bodyRef}
          className="no-scrollbar"
          tabIndex={0}
          role="region"
          aria-label={`${title}, full text`}
          style={{
            padding: isSheet ? '16px 16px 20px' : '20px 24px 24px',
            overflowY: 'auto', flex: 1,
            fontSize: 15, lineHeight: 1.7,
            fontFamily: 'var(--font-dm-sans)',
            color: 'var(--text-secondary)',
          }}
        >
          {kind === 'waiver' ? (
            <>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>MAPL Tours Jamaica - Activity Waiver & Release of Liability</p>
              <p style={{ marginBottom: 12 }}>Effective Date: January 1, 2025</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>1. Acknowledgment of Risk</p>
              <p style={{ marginBottom: 16 }}>I understand that the experiences offered through MAPL Tours Jamaica involve physical activities that carry inherent risks, including but not limited to: cliff diving, waterfall climbing, bamboo rafting, snorkeling, hiking through mountainous terrain, swimming in natural bodies of water, and participation in cultural activities. I acknowledge that these activities may result in injury, illness, or in rare cases, death.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>2. Assumption of Risk</p>
              <p style={{ marginBottom: 16 }}>I voluntarily assume all risks associated with participating in any experience booked through MAPL Tours Jamaica, including risks arising from the negligence of MAPL Tours Jamaica, its partners, guides, affiliates, and local experience creators. I understand that natural environments in Jamaica may present hazards including uneven terrain, strong currents, wildlife, weather changes, and remote locations with limited medical access.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>3. Release of Liability</p>
              <p style={{ marginBottom: 16 }}>I hereby release, discharge, and hold harmless MAPL Tours Jamaica, MAPL Tech, its officers, employees, agents, partners, and local experience creators from any and all claims, demands, or causes of action arising out of or related to any loss, damage, or injury sustained during or as a result of participation in any booked experience.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>4. Medical Fitness</p>
              <p style={{ marginBottom: 16 }}>I certify that I am physically fit and have no medical conditions that would prevent my participation in the booked activities. I agree to inform my experience guide of any medical conditions, allergies, or physical limitations prior to the start of any activity. If I am booking on behalf of minors, I certify that they are also fit to participate and I accept responsibility for their safety.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>5. Photo & Video Consent</p>
              <p style={{ marginBottom: 16 }}>I grant MAPL Tours Jamaica permission to use photographs and video recordings taken during my experience for promotional purposes, including social media, website content, and marketing materials, unless I notify my guide in writing before the activity begins.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>6. Governing Law</p>
              <p style={{ marginBottom: 16 }}>This waiver shall be governed by the laws of Jamaica. Any disputes arising from this agreement shall be resolved in the courts of Kingston, Jamaica.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>7. Severability</p>
              <p>If any provision of this waiver is found to be unenforceable, the remaining provisions shall continue in full force and effect. By checking the waiver box during checkout, you acknowledge that you have read, understood, and agree to be bound by the terms of this Activity Waiver & Release of Liability.</p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>MAPL Tours Jamaica - Terms of Service</p>
              <p style={{ marginBottom: 12 }}>Effective Date: January 1, 2025</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>1. About MAPL Tours Jamaica</p>
              <p style={{ marginBottom: 16 }}>MAPL Tours Jamaica is a product of MAPL Tech. We operate an online platform that connects travelers with curated, locally-created experiences across Jamaica. We act as an intermediary between you (the &ldquo;Guest&rdquo;) and independent local experience creators (the &ldquo;Creators&rdquo;). MAPL Tours Jamaica does not directly provide the experiences listed on our platform.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>2. Booking & Payment</p>
              <p style={{ marginBottom: 16 }}>All prices are listed in USD. A service fee is applied to all transactions to cover your tour guide, platform costs, and customer support. Payment is processed securely through Stripe. Your card will be charged at the time of booking. Bookings close 24 hours before an experience or pickup begins; anything inside that window must be arranged with us directly and is subject to availability. Private door-to-door transport is included in every booking and is itemized in your total; you provide the pickup and drop-off locations at checkout. You will receive a confirmation email with your booking details and pickup arrangements within 24 hours. MAPL Tours Jamaica is your single point of contact for everything to do with a booking; questions and changes go to contact@mapltours.com rather than to the Creator directly.</p>

              <p data-section="cancellation" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>3. Cancellation, Changes &amp; Refunds</p>
              <p style={{ marginBottom: 16 }}>Flexible cancellation is available within 48 hours of booking. Cancellations are requested from your Profile page and reviewed by us; your booking remains confirmed until the request is approved. If approved within that window, you will receive a refund of the amount paid, less an administration charge equivalent to 20% of the total amount of fees paid plus taxes (if applicable). Changes to your date or number of guests may be requested within the same 48 hours by contacting us, subject to availability. Cancellations and changes requested more than 48 hours after booking cannot be accepted and the booking is non-refundable. Once an experience or pickup has begun it has been delivered and is no longer refundable or changeable. If you do not arrive for your experience, the booking is charged in full. If a Creator cancels an experience, you will receive a full refund or the option to rebook. Where weather or safety conditions force a cancellation, the booking will be rescheduled at no additional cost, to another date or an experience of equivalent value; a full refund is given only where no reschedule is possible within your time in Jamaica.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>4. Guest Responsibilities</p>
              <p style={{ marginBottom: 16 }}>Guests must be ready at the agreed pickup location at the agreed time. Guests must follow all safety instructions provided by the Creator or guide. Guests must be of legal drinking age to participate in experiences involving alcohol. Guests are responsible for their own travel insurance and personal belongings. Guests must treat Creators, local communities, and the natural environment with respect.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>5. Creator Responsibilities</p>
              <p style={{ marginBottom: 16 }}>All Creators on the MAPL Tours Jamaica platform are vetted and approved by our team. Creators are required to maintain valid insurance, certifications, and licenses where applicable. Creators are responsible for providing the experience as described on the platform. MAPL Tours Jamaica reserves the right to remove any Creator who fails to meet our quality standards.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>6. Intellectual Property</p>
              <p style={{ marginBottom: 16 }}>All content on the MAPL Tours Jamaica platform, including text, images, videos, logos, and design elements, is the property of MAPL Tech and is protected by copyright law. User-generated content, including reviews and comments, grants MAPL Tours Jamaica a non-exclusive, royalty-free license to use, display, and distribute such content.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>7. Limitation of Liability</p>
              <p style={{ marginBottom: 16 }}>MAPL Tours Jamaica shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our platform or participation in any experience. Our total liability shall not exceed the amount paid for the specific experience in question.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>8. Privacy</p>
              <p style={{ marginBottom: 16 }}>We collect and process personal data in accordance with our Privacy Policy. By using our platform, you consent to the collection and processing of your data as described therein. We do not sell your personal data to third parties.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>9. Governing Law</p>
              <p style={{ marginBottom: 16 }}>These Terms of Service shall be governed by the laws of Jamaica. Any disputes shall be resolved in the courts of Kingston, Jamaica.</p>

              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>10. Changes to Terms</p>
              <p>MAPL Tours Jamaica reserves the right to modify these Terms of Service at any time. Continued use of the platform after changes constitutes acceptance of the updated terms. Users will be notified of material changes via email.</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: isSheet ? '12px 16px' : '16px 24px',
            paddingBottom: isSheet ? 'calc(12px + env(safe-area-inset-bottom))' : 16,
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end',
            flexShrink: 0, background: '#fff',
          }}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
            style={{
              height: 48, padding: '0 24px', fontSize: 15,
              borderRadius: 10, width: isSheet ? '100%' : undefined,
            }}
          >
            I understand
          </button>
        </div>
      </div>
    </>
  )
}
