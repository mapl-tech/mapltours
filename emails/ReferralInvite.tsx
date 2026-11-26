import { Heading, Text, Link, Section } from '@react-email/components'
import { MaplLayout, maplStyles as s } from './_Layout'

/**
 * The invitation to the referral program (lib/referrals), sent when an admin
 * adds someone on /admin/referrals. The address it goes to IS the invitation:
 * signing in to /referrals with it opens their referral page, so the email
 * says which address to use. No link carries a token; nothing here works for
 * anyone who is not signed in as that address.
 *
 * Every figure comes from the referrer's own row and lib/referrals/rules, so
 * the email can never promise a rate the page does not show.
 */

export interface ReferralInviteProps {
  firstName: string
  /** The invited address: the one to sign in with. */
  email: string
  discountPercent: string
  commissionPercent: string
  pageUrl: string
  supportEmail: string
}

const link = { color: '#1A1714', textDecoration: 'underline' }

export default function ReferralInvite(p: ReferralInviteProps) {
  return (
    <MaplLayout preheader={`Your guests get ${p.discountPercent} off airport rides and tours. You earn ${p.commissionPercent} of what they pay.`} title="Your referral invitation">
      <Text style={s.eyebrow}>Referrals</Text>
      <Heading as="h1" style={s.hero} className="mapl-h1">You&rsquo;re invited to refer guests to us.</Heading>
      <Text className="mapl-body" style={s.heroLead}>
        Hi {p.firstName}, we would love for you to send your guests to MAPL Tours Jamaica for their airport rides and day trips.
        Here is how it works.
      </Text>

      <Section style={s.card}>
        <Section style={s.cardHeader}>
          <Heading as="h2" style={s.cardHeaderText}>How it works</Heading>
        </Section>
        <Section style={s.cardBody}>
          <ul style={s.steps}>
            <li className="mapl-body" style={{ ...s.step, marginTop: 0 }}>
              Make your own codes on your referral page, up to 7: one for your welcome book, one for WhatsApp, and so on.
            </li>
            <li className="mapl-body" style={s.step}>Your guests get {p.discountPercent} off airport rides and tours with your code.</li>
            <li className="mapl-body" style={s.step}>You earn {p.commissionPercent} of what they pay, once their trip has happened.</li>
            <li className="mapl-body" style={s.step}>We pay you every Monday, free, into your Wise US-dollar account.</li>
          </ul>
        </Section>
      </Section>

      <Section style={s.ctaWrap}>
        <Link href={p.pageUrl} className="mapl-cta-block" style={s.cta}>Set up my referral page</Link>
      </Section>

      <Text className="mapl-body" style={{ ...s.body, marginTop: 20 }}>
        Sign in with <strong>{p.email}</strong>, the address this invitation went to. Setup takes about five minutes.
        To get paid you will need your Wise US-dollar account details: in Wise, open your US dollar balance, then Account details.
      </Text>
      <Text className="mapl-note" style={{ ...s.note, marginTop: 20 }}>
        Questions, or want to use a different address? Reply to this email or write to{' '}
        <Link href={`mailto:${p.supportEmail}`} style={link}>{p.supportEmail}</Link>.
      </Text>
    </MaplLayout>
  )
}
