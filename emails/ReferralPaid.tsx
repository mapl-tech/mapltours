import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to a referrer once the payout run has paid them (lib/referrals/
 * payout-run), with MAPL's operations inbox on BCC. It says how much went,
 * where it went (the last four digits only) and exactly which trips it is
 * for, from the same payout items the referral page lists, so the email, the
 * page and Wise always agree. No guest's name or contact details.
 */

export interface ReferralPaidProps {
  firstName: string
  amount: string
  last4: string
  lines: Array<{ what: string; days: string; code: string; guestPaid: string; commission: string }>
  pageUrl: string
  supportEmail: string
}

const link = { color: '#1A1714', textDecoration: 'underline' }
const cell = { padding: '12px 0', borderTop: '1px solid #F1ECE3', verticalAlign: 'top' as const }

export default function ReferralPaid(p: ReferralPaidProps) {
  const n = p.lines.length
  return (
    <MaplLayout preheader={`${p.amount} is on its way to your Wise account ending ${p.last4}.`} title={`We sent you ${p.amount}`}>
      <Text style={s.eyebrow}>Referrals</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">We sent you {p.amount}.</Heading>
      <Text className="mapl-body" style={s.heroLead}>
        Hi {p.firstName}, your commission for {n === 1 ? 'one trip' : `${n} trips`} is on its way to your Wise account ending{' '}
        <strong>{p.last4}</strong>. Wise usually puts it there within seconds.
      </Text>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>{n === 1 ? 'The trip' : `The ${n} trips`}</Heading>
        </Section>
        <Section style={{ padding: '4px 20px 8px' }}>
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...cell, borderTop: i === 0 ? 'none' : cell.borderTop }}>
                    <Text className="mapl-body" style={{ ...s.body, margin: 0, fontWeight: 600 }}>{l.what}</Text>
                    <Text className="mapl-note" style={{ ...s.bodyMuted, margin: '2px 0 0' }}>
                      {l.days} · code {l.code} · guest paid {l.guestPaid}
                    </Text>
                  </td>
                  <td style={{ ...cell, borderTop: i === 0 ? 'none' : cell.borderTop, textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12 }}>
                    <Text className="mapl-body" style={{ ...s.body, margin: 0, fontWeight: 700 }}>{l.commission}</Text>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...cell, borderTop: '1px solid #E7E1D6' }}>
                  <Text className="mapl-body" style={{ ...s.body, margin: 0, fontWeight: 700 }}>Total sent</Text>
                </td>
                <td style={{ ...cell, borderTop: '1px solid #E7E1D6', textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12 }}>
                  <Text className="mapl-body" style={{ ...s.body, margin: 0, fontWeight: 700 }}>{p.amount}</Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      </Section>

      <Section style={s.ctaWrap}>
        <Link href={p.pageUrl} className="mapl-cta-block" style={s.cta}>See my referral page</Link>
      </Section>

      <Text className="mapl-note" style={{ ...s.note, marginTop: 20 }}>
        Thank you for sending your guests our way. Questions about a payment? Reply to this email or write to{' '}
        <Link href={`mailto:${p.supportEmail}`} style={link}>{p.supportEmail}</Link>.
      </Text>
    </MaplLayout>
  )
}
