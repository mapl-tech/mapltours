import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import CheckIcon from './CheckIcon'
import { FONT, H3, SUPPORT_SIZE } from './tokens'

/**
 * A short, worked chat on /connect: the question, the all-in fare, the
 * booking link. The fare is passed in from the rate card (buildQuote, the
 * function checkout prices with), so the example can never show a price the
 * site would not charge; with no fare the price sentence is left out rather
 * than guessed.
 *
 * It is an illustration, so the link card is not a link: opening a real /book
 * link would put a ride in the visitor's cart.
 */

const NUMBER_WORDS = ['no one', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']

const speaker: CSSProperties = {
  margin: '0 0 4px',
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--text-secondary)',
}

// How far a message stays from the far side: 32px on a phone, up to 96px wide.
const INSET = 'clamp(32px, 10vw, 96px)'

const bubble: CSSProperties = {
  margin: 0,
  padding: '12px 16px',
  fontFamily: FONT,
  fontSize: 16,
  lineHeight: 1.5,
}

// Messages arrive one after another with the site's scroll reveal (--i
// staggers them by 60ms); reduced motion shows them at once.
function You({ i, children }: { i: number; children: ReactNode }) {
  return (
    <li
      data-reveal
      style={{ '--i': i, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: INSET } as CSSProperties}
    >
      <p style={speaker}>You</p>
      <p
        style={{
          ...bubble,
          // Neutral, not the gold tint: the tinted rounded box with a request
          // in it is the copy button's look, and this one is not a control.
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-xl) var(--r-xl) var(--r-sm) var(--r-xl)',
        }}
      >
        {children}
      </p>
    </li>
  )
}

function Assistant({ i, children }: { i: number; children: ReactNode }) {
  return (
    <li
      data-reveal
      style={{ '--i': i, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: INSET } as CSSProperties}
    >
      <p style={speaker}>Your assistant</p>
      <div
        style={{
          ...bubble,
          background: '#fff',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl) var(--r-xl) var(--r-xl) var(--r-sm)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {children}
      </div>
    </li>
  )
}

export default function ChatDemo({
  hotel,
  passengers,
  fareUsd,
  drive,
}: {
  hotel: string
  passengers: number
  fareUsd: number | null
  /** e.g. "75 to 90 minutes" */
  drive: string | null
}) {
  const party = NUMBER_WORDS[passengers] ?? String(passengers)
  return (
    <div
      style={{
        padding: 'clamp(16px, 3vw, 24px)',
        background: 'var(--bg-warm)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
      }}
    >
      <h3 style={H3}>What it looks like in a chat</h3>
      <ol role="list" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 16 }}>
        <You i={0}>
          How much is a private ride from MBJ to {hotel} and back, for {party} of us?
        </You>
        <Assistant i={1}>
          {fareUsd !== null ? (
            <>
              The round trip is <strong style={{ fontWeight: 700 }}>US${fareUsd}</strong> all in, for up to {passengers}&nbsp;people
              {drive ? `, and the drive takes about ${drive} each way` : ''}. Shall I set it up?
            </>
          ) : (
            <>I have the all-in price from the MAPL Tours Jamaica rate card. Shall I set it up?</>
          )}
        </Assistant>
        <You i={2}>
          {/* Days without a month, so the example never reads as past; no-break spaces keep times and flight numbers whole. */}
          Yes. We land on the 12th at 2:30&nbsp;pm on AA&nbsp;1234 and fly home on the 19th at 4&nbsp;pm on AA&nbsp;1235.
        </You>
        <Assistant i={3}>
          Here is your booking link. Your flights and pickup times are filled in; check them, add your name and pay on
          mapltours.com.
          <span
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'var(--bg-warm)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <Image
              src="/mcp/icon-512.png"
              alt=""
              width={40}
              height={40}
              style={{ flex: '0 0 auto', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, lineHeight: 1.4, color: 'var(--text-secondary)' }}>mapltours.com</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
                Round trip, MBJ and {hotel}, {passengers} passengers
              </span>
              {fareUsd !== null && (
                <span style={{ display: 'block', fontSize: 15, lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                  US${fareUsd} all in, paid on mapltours.com
                </span>
              )}
            </span>
          </span>
        </Assistant>
      </ol>
      <p
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          margin: '16px 0 0',
          fontFamily: FONT,
          fontSize: SUPPORT_SIZE,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}
      >
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: '1.5em' }}>
          <CheckIcon size={16} color="var(--emerald)" />
        </span>
        <span>Nothing is booked or charged until you pay on that page.</span>
      </p>
    </div>
  )
}
