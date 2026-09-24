import type { Metadata } from 'next'
import Link from 'next/link'
import EditorialPage, { Section } from '@/components/EditorialPage'

/**
 * The Martha Brae raft giveaway (Sept 24 to Nov 30 2026, drawn Dec 1).
 *
 * Entry is the 5% code email itself: every address that asks for JAMAICA5 on
 * mapltours.com or bio.mapltours.com in the window is in the draw, and the
 * code email says so (mapl-bio netlify/lib/emails.mts, which drops the
 * giveaway block by itself once entries close). The draw picks from the
 * HubSpot contacts tagged mapl_giveaway = martha-brae-2026.
 *
 * The rules carry what Canadian, US and UK promotions law expects to be
 * disclosed up front: no purchase necessary, who can enter, the prize and
 * its value, the dates, how the winner is chosen, the odds, and the
 * skill-testing question for a Canadian winner. Quebec is excluded because
 * it has its own contest filing and fees. When the winner accepts, name
 * them in "The winner" section (first name and country, with permission).
 */
export const metadata: Metadata = {
  title: 'Raft giveaway',
  description:
    'Ask for your 5% code by November 30, 2026 and you are in the draw for a private bamboo raft for two on the Martha Brae. The full rules.',
  alternates: { canonical: 'https://mapltours.com/giveaway' },
}

const list = { marginTop: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 } as const
const a = { color: 'var(--text-primary)', textDecoration: 'underline' } as const

export default function GiveawayPage() {
  return (
    <EditorialPage slug="giveaway" label="Giveaway" title="A raft for two on the Martha Brae">
      <Section title="The short version">
        <p>
          Ask for your 5% code before the end of November 30, 2026 and you are in the draw. One winner gets a private
          bamboo raft for two on the Martha Brae: three slow miles of green river, a captain poling you down, and a car
          to and from your hotel. We draw on December 1, 2026 and email the winner the same day. No purchase needed.
        </p>
      </Section>

      <Section title="How to enter">
        <ul style={list}>
          <li>Ask for the 5% code with your email address, in the popup on <Link href="/" style={a}>mapltours.com</Link> or at <a href="https://bio.mapltours.com" style={a}>bio.mapltours.com</a>. The email with your code confirms you are in.</li>
          <li>Entries open September 24, 2026 and close at 11:59 pm Eastern Time on November 30, 2026.</li>
          <li>One entry per person. Asking again, or from a second address, does not add a chance.</li>
          <li>Entry is free. Booking a tour or a ride does not change your odds.</li>
        </ul>
      </Section>

      <Section title="The prize">
        <p>
          One prize: <Link href="/experience/bamboo-rafting-on-the-martha-brae" style={a}>Bamboo Rafting on the Martha Brae</Link> for
          two people. That is a private bamboo raft with a licensed captain, entry to the raft village, and private
          transport from one hotel to the river and back, in the areas we serve on mapltours.com. Approximate retail
          value: US$128.
        </p>
        <ul style={list}>
          <li>Book your date with us at least 48 hours ahead, subject to availability, and take the trip by December 31, 2027.</li>
          <li>Not included: flights, accommodation, travel insurance, drinks, craft market purchases, and your captain&rsquo;s tip.</li>
          <li>The prize has no cash value and cannot be exchanged or transferred. You choose who rides with you.</li>
          <li>If the tour cannot run, we may offer another private tour of equal or greater value instead.</li>
        </ul>
      </Section>

      <Section title="Planning to raft anyway?">
        <p>
          Book it. If you win after paying us for Bamboo Rafting on the Martha Brae between September 24
          and December 1, 2026, you can take a refund of what you paid for that tour, up to US$128, in place of the
          prize.
        </p>
      </Section>

      <Section title="Who can enter">
        <p>
          Legal residents of Canada (except Quebec), the United States and the United Kingdom who have reached the age
          of majority where they live when they enter. Not open to MAPL Tours Jamaica staff, our drivers and tour
          operators, or the people they live with.
        </p>
      </Section>

      <Section title="How we pick and tell the winner">
        <ul style={list}>
          <li>On December 1, 2026 we draw one winner at random from all eligible entries. Your odds depend on how many eligible entries we receive.</li>
          <li>We email the winner that day, at the address they entered with, from contact@mapltours.com. The winner has 7 days to reply.</li>
          <li>A winner who lives in Canada must first answer a mathematical skill-testing question correctly, without help, by email or phone.</li>
          <li>If the winner does not reply in time, is not eligible, or turns the prize down, we draw again from the remaining entries.</li>
        </ul>
      </Section>

      <Section title="The winner">
        <p>We announce the winner here in December 2026, by first name and country, with their permission.</p>
      </Section>

      <Section title="The fine print">
        <ul style={list}>
          <li>MAPL Tours Jamaica, Montego Bay, runs this giveaway. Questions go to <a href="mailto:contact@mapltours.com" style={a}>contact@mapltours.com</a>.</li>
          <li>We use your email address to send your code and, if you win, to reach you. Entering does not sign you up for newsletters. Our <Link href="/privacy" style={a}>Privacy Policy</Link> covers the rest.</li>
          <li>This giveaway is not sponsored, endorsed or administered by, or associated with, Facebook, Instagram, Meta or Google.</li>
          <li>We may disqualify entries made with fake or automated addresses. If fraud, a technical failure or anything else outside our control affects the fairness of the draw, we may change or cancel it where the law allows, and we will say so on this page.</li>
          <li>Void where prohibited. These rules follow our <Link href="/terms" style={a}>Terms of Service</Link> and the laws of Jamaica, without taking away any rights you have where you live.</li>
        </ul>
      </Section>
    </EditorialPage>
  )
}
