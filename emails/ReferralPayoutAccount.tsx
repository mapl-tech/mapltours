import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * Sent to a referrer whenever their payout account is added or changed
 * (lib/referrals/payout-server), with MAPL's operations inbox on BCC. It is
 * the security notice: if someone else changed where the money goes, the
 * real referrer hears at once, and payouts to the new account wait three days
 * (PAYOUT_ACCOUNT_HOLD_HOURS), which is time to stop it.
 *
 * Only the last four digits and the holder's name appear; never the account
 * or routing number.
 */

export interface ReferralPayoutAccountProps {
  firstName: string
  kind: 'added' | 'changed'
  last4: string
  holder: string
  previousLast4: string | null
  /** "Sunday, November 29": the first day a payout may go to it. */
  startsText: string
  pageUrl: string
  supportEmail: string
}

const link = { color: '#1A1714', textDecoration: 'underline' }

export default function ReferralPayoutAccount(p: ReferralPayoutAccountProps) {
  const changed = p.kind === 'changed'
  return (
    <MaplLayout
      preheader={changed ? `Your payouts now go to the Wise account ending ${p.last4}.` : `We will pay you into the Wise account ending ${p.last4}.`}
      title={changed ? 'Your payout account was changed' : 'Your payout account is set'}
    >
      <Text style={s.eyebrow}>Referrals</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">
        {changed ? 'Your payout account was changed.' : 'Your payout account is set.'}
      </Heading>
      <Text className="mapl-body" style={s.heroLead}>
        Hi {p.firstName}, {changed ? 'from now on we will pay you into' : 'we will pay you into'} the Wise account ending{' '}
        <strong>{p.last4}</strong>, in the name of {p.holder}.
        {changed && p.previousLast4 ? ` The account ending ${p.previousLast4} is no longer used.` : ''}
      </Text>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>{changed ? 'Was this you?' : 'What happens next'}</Heading>
        </Section>
        <Section style={s.cardBody}>
          <ul style={s.steps}>
            <li className="mapl-body" style={{ ...s.step, marginTop: 0 }}>
              For your safety, payouts to a new account start three days after it is added: from {p.startsText}.
            </li>
            {changed ? (
              <li className="mapl-body" style={s.step}>
                If you did not make this change, reply to this email right away. We will stop every payout until it is sorted out.
              </li>
            ) : (
              <li className="mapl-body" style={s.step}>We pay what you have earned every Monday. Wise charges nothing for it.</li>
            )}
          </ul>
        </Section>
      </Section>

      <Section style={s.ctaWrap}>
        <Link href={p.pageUrl} className="mapl-cta-block" style={s.cta}>Open my referral page</Link>
      </Section>

      <Text className="mapl-note" style={{ ...s.note, marginTop: 20 }}>
        Questions? Reply to this email or write to <Link href={`mailto:${p.supportEmail}`} style={link}>{p.supportEmail}</Link>.
      </Text>
    </MaplLayout>
  )
}
