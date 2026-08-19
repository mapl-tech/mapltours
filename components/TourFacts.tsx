import { Check, X, Backpack, MapPin, Users, Activity, Info, Clock } from 'lucide-react'
import type { Experience } from '@/lib/experiences'
import { priceUnitLabel } from '@/lib/experiences'

/**
 * The facts of one tour, rendered on the server.
 *
 * Every field here was already written, already approved and already sitting
 * in lib/experiences.ts on all 22 experiences: about, included, notIncluded,
 * bring, ages, fitness, meetingPoint, additionalInfo. None of it reached a
 * single page. ExperienceDetail never renders these fields, and the details
 * sheet reads a different module (lib/tour-details.ts) that only covers ids 1
 * to 15, so the seven packages had no inclusions anywhere at all.
 *
 * That made it two problems wearing one coat. A guest deciding between this
 * and the same tour on Viator could not find out what was included, and a
 * crawler or an answer engine reading the page found roughly sixty unique
 * words about the tour it is named after, under a thousand words describing
 * fourteen OTHER tours. This is a server component precisely so the answer to
 * "what do I get" is in the HTML rather than behind a tap.
 */

const H2: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)',
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: '-0.01em',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
}

const ITEM: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 14.5,
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  marginBottom: 7,
}

function List({ items, tone }: { items: string[]; tone: 'in' | 'out' | 'plain' }) {
  const Icon = tone === 'in' ? Check : tone === 'out' ? X : Backpack
  const color = tone === 'in' ? 'var(--emerald)' : tone === 'out' ? 'var(--text-tertiary)' : 'var(--gold-text)'
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item} style={ITEM}>
          <Icon size={15} color={color} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '20px 22px',
      }}
    >
      {children}
    </div>
  )
}

export default function TourFacts({ exp }: { exp: Experience }) {
  const groupMax = exp.pricing.mode === 'group' ? exp.pricing.tierMax : null

  return (
    <section
      aria-labelledby="tour-facts-heading"
      style={{ background: 'var(--bg-warm)', borderTop: '1px solid var(--border)', padding: '48px 0 56px' }}
    >
      <div className="container" style={{ maxWidth: 900 }}>
        <h2
          id="tour-facts-heading"
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 500,
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            marginBottom: 6,
            textWrap: 'balance',
          }}
        >
          {exp.title}
        </h2>

        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 14,
            color: 'var(--text-tertiary)',
            marginBottom: 18,
          }}
        >
          {exp.destination}, {exp.parish} &middot; {exp.duration} &middot; ${exp.price}{' '}
          {priceUnitLabel(exp.pricing)}
        </p>

        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 16.5,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            maxWidth: '62ch',
            marginBottom: 32,
          }}
        >
          {exp.about}
        </p>

        <div
          className="tour-facts-grid"
          // start, not stretch: a three-item list next to a six-item one was
          // being padded to the same height, leaving a card two thirds empty.
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            alignItems: 'start',
            gap: 16,
          }}
        >
          {exp.included?.length ? (
            <Card>
              <h3 style={H2}>
                <Check size={16} color="var(--emerald)" strokeWidth={2.5} aria-hidden />
                What is included
              </h3>
              <List items={exp.included} tone="in" />
            </Card>
          ) : null}

          {exp.notIncluded?.length ? (
            <Card>
              <h3 style={H2}>
                <X size={16} color="var(--text-tertiary)" strokeWidth={2.5} aria-hidden />
                Not included
              </h3>
              <List items={exp.notIncluded} tone="out" />
            </Card>
          ) : null}

          {exp.bring?.length ? (
            <Card>
              <h3 style={H2}>
                <Backpack size={16} color="var(--gold-text)" strokeWidth={2.5} aria-hidden />
                What to bring
              </h3>
              <List items={exp.bring} tone="plain" />
            </Card>
          ) : null}

          <Card>
            <h3 style={H2}>
              <Info size={16} color="var(--text-secondary)" strokeWidth={2.5} aria-hidden />
              Good to know
            </h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li style={ITEM}>
                <MapPin size={15} color="var(--text-tertiary)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
                <span>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Meeting point.</strong>{' '}
                  {exp.meetingPoint}
                </span>
              </li>
              <li style={ITEM}>
                <Clock size={15} color="var(--text-tertiary)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
                <span>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Duration.</strong> {exp.duration}
                </span>
              </li>
              <li style={ITEM}>
                <Users size={15} color="var(--text-tertiary)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
                <span>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Who it suits.</strong> {exp.ages}
                  {groupMax ? `. Private tour, one price for up to ${groupMax} people` : ''}
                </span>
              </li>
              <li style={ITEM}>
                <Activity size={15} color="var(--text-tertiary)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
                <span>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Effort.</strong> {exp.fitness}
                </span>
              </li>
              {/* An ARRAY of notes, one sentence each. Rendered as a single
                  expression React concatenated them with no separator, which
                  ran "…at no cost.Lockers are available…" together. */}
              {(exp.additionalInfo ?? []).map((note, i, all) => (
                <li key={note} style={i === all.length - 1 ? { ...ITEM, marginBottom: 0 } : ITEM}>
                  <Info size={15} color="var(--text-tertiary)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </section>
  )
}
