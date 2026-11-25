import { Heading, Text, Section, Link } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to a guest when the driver for one ride changes after they were told
 * who it is (or, sent first, to tell them who it is). Sent by hand from the
 * dispatch console's driver-update card; never by a job.
 *
 * Every word that states a fact (the day, the time, the flight, the places,
 * the driver, the van, the plate, the number) is worked out in
 * lib/driver-update.ts from the booking and the saved driver, and tested
 * there line by line. This file only lays it out, in the same design as the
 * day-of email (TransferDayOf) and the updates the owner approved on
 * Nov 17 and Nov 18 2026.
 */

/** A step's words; `b` marks a bold run. */
export type StepPart = { t: string; b?: boolean }

export interface DriverUpdateProps {
  preheader: string
  /** "Today · Driver update" */
  eyebrow: string
  headline: string
  lead: string
  bookingRef: string
  driver: {
    name: string
    /** "Toyota Hiace, silver" */
    vehicle: string
    plate: string
    whatsapp: string
    /** https://wa.me/<digits> */
    whatsappLink: string
  }
  /** "Your pickup" or "Your departure" */
  tripTitle: string
  tripRows: { label: string; value: string }[]
  /** "When you land" or "Before you go" */
  stepsTitle: string
  steps: StepPart[][]
  notes: string[]
  /** Set only on a travel party member's copy: the closing line and the stop link. */
  party?: { footer: string; stopUrl: string }
}

const stepList: React.CSSProperties = { margin: 0, paddingLeft: 20, color: '#57534C', fontSize: 14, lineHeight: 1.6 }
const stepItem: React.CSSProperties = { margin: '0 0 8px' }

function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <Section style={{ padding: '9px 0', borderBottom: last ? undefined : '1px solid #f0f0f0' }}>
      <Text style={{ ...s.sectionLabel, margin: 0 }}>{label}</Text>
      <Text style={{ ...s.body, margin: '3px 0 0', fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

export default function DriverUpdate(p: DriverUpdateProps) {
  return (
    <MaplLayout preheader={p.preheader} title="Driver update">
      <Text style={s.eyebrow}>{p.eyebrow}</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">{p.headline}</Heading>
      <Text style={s.heroLead}>{p.lead}</Text>

      <Section style={{ margin: '20px 0 0' }}>
        <span style={s.refPill}>{p.bookingRef}</span>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}><Text style={s.cardHeaderText}>Your driver</Text></Section>
        <Section style={s.cardBody}>
          <Row label="Name" value={p.driver.name} />
          <Row label="Vehicle" value={p.driver.vehicle} />
          <Row label="License plate" value={p.driver.plate} />
          <Row label="WhatsApp" value={<Link href={p.driver.whatsappLink} style={{ color: '#1a1a1a' }}>{p.driver.whatsapp}</Link>} last />
        </Section>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}><Text style={s.cardHeaderText}>{p.tripTitle}</Text></Section>
        <Section style={s.cardBody}>
          {p.tripRows.map((r, i) => <Row key={r.label} label={r.label} value={r.value} last={i === p.tripRows.length - 1} />)}
        </Section>
      </Section>

      <Section style={s.card}>
        <Section style={s.cardHeader}><Text style={s.cardHeaderText}>{p.stepsTitle}</Text></Section>
        <Section style={s.cardBody}>
          <ol style={stepList}>
            {p.steps.map((step, i) => (
              <li key={i} style={stepItem}>
                {step.map((part, j) => (part.b ? <strong key={j}>{part.t}</strong> : <span key={j}>{part.t}</span>))}
              </li>
            ))}
          </ol>
        </Section>
      </Section>

      {p.notes.map((n) => <Text key={n} style={s.note}>{n}</Text>)}
      {/* A travel party member's copy (lib/travel-party driverUpdateForParty): why it came, and how to stop these. */}
      {p.party && (
        <Text style={s.note}>
          {p.party.footer}{' '}
          <Link href={p.party.stopUrl} style={{ color: '#1a1a1a', textDecoration: 'underline' }}>Stop these emails</Link>
        </Text>
      )}
    </MaplLayout>
  )
}
