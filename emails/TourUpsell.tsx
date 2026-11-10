import { Button, Heading, Hr, Img, Link, Section, Text } from '@react-email/components'
import { MaplLayout } from './_Layout'

/**
 * The one tour email a ride-only guest gets, about two weeks before they land.
 *
 * Built to Sentinel's brief for a post-purchase cross-sell (Nov 2026):
 * - Reciprocity: the email gives a plan before it asks for anything. It knows
 *   their free days, their hotel and who is travelling, and it says so first.
 * - Honest anchoring: the first number on every card is the whole price for
 *   THIS party with hotel pickup, never a "from" or a per-head teaser.
 * - Few, comparable choices (Hick's law): at most three tours, laid out the
 *   same way, with the shortest day out marked when the data says so.
 * - Shortest chain: each primary button opens checkout with the tour, the day,
 *   the party and the hotel pickup already filled in (/book), and the email
 *   says the day can be changed, so the preselected day is a default, not a
 *   commitment.
 * - Progressive disclosure: photos and the full write-up are one tap away
 *   ("See photos and details"), never needed to decide.
 * - A person, not a funnel: a plain reply line, and a plain statement that
 *   this is the only tour email for the trip. No countdown, no scarcity, no
 *   discount pressure.
 *
 * Copy rules: the brand in full, no dashes, drivers "pick you up", no claim
 * the site does not make. Prices and door-to-door times come from
 * lib/experiences through lib/tour-upsell; nothing here types a number.
 */

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const INK = '#1A1714'
const INK_SOFT = '#57534C'
const MUTED = '#6E6A62'
const BORDER = '#E7E1D6'
const GREEN = '#1D7A50'
const GREEN_DEEP = '#12563A'
const GREEN_TINT = '#EEF4EE'
const PAPER = '#FAF8F3'
const LINK = '#5A4A16'

export interface TourUpsellPick {
  title: string
  /** The tour's own one-line pitch. */
  description: string
  /** Time at the activity, e.g. "3 hrs at Rick's". */
  duration: string
  /** e.g. "3.5 to 4 hours door to door", or null when not published for their area. */
  doorToDoor: string | null
  /** e.g. "Ages 8 and up", "All ages". */
  ages: string | null
  /** All-in total for THIS party. */
  total: number
  /** Opens checkout with tour, day, party and pickup filled in. */
  bookUrl: string
  /** The tour's page. */
  detailsUrl: string
  /** ABSOLUTE url of the email JPEG. */
  imageUrl: string
  /** True on the one card that is the shortest day out. */
  shortest: boolean
}

export interface TourUpsellEat {
  name: string
  town: string
  description: string
  mapsUrl: string
}

export interface TourUpsellProps {
  firstName: string | null
  /** Where they are staying, e.g. "Skylark Negril Beach Resort". */
  hotel: string
  /** The area or town, e.g. "Negril". */
  town: string
  /** e.g. "Mon, Jan 11". */
  arrivalLabel: string
  /** e.g. "Tue, Jan 12": the day every button books. */
  tourDayLabel: string
  freeDays: number | null
  party: number
  /** True when the guest's note mentions a child, so the picks were age-checked. */
  childAware: boolean
  picks: TourUpsellPick[]
  eat: TourUpsellEat | null
  exploreUrl: string
  unsubscribeUrl: string
  /** The mailing address to print, or null (lib/trip-tips/postal). */
  postalAddress: string | null
  supportEmail: string
}

const WORDS = ['zero', 'one', 'two', 'three']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** "you", "both of you", "all 4 of you". */
export function partyPhrase(party: number): string {
  if (party <= 1) return 'you'
  if (party === 2) return 'both of you'
  return `all ${party} of you`
}

export function upsellHeadline(p: Pick<TourUpsellProps, 'freeDays' | 'town' | 'picks'>): string {
  const n = p.picks.length
  const ways = n === 1 ? 'A good way' : `${cap(WORDS[n] ?? String(n))} good ways`
  if (p.freeDays != null && p.freeDays > 0) {
    return `${p.freeDays} free ${p.freeDays === 1 ? 'day' : 'days'} in ${p.town}. ${ways} to spend one.`
  }
  return n === 1 ? `A good tour near ${p.town}` : `${cap(WORDS[n] ?? String(n))} good tours near ${p.town}`
}

/**
 * The subject, chosen with Sentinel (Nov 10 2026). It leads with the guest's
 * name and a fact only their own booking could give ("your 5 free days"), so
 * it reads as about their trip rather than as a promotion, and it fits the
 * roughly 40 characters an iPhone inbox shows ("Taylor, your 5 free days in
 * Negril" is 34). It names no tour and no price: the preheader says what is
 * inside. Rejected: "three days out from Negril" (reads as "three days
 * before you arrive"), anything urgent ("Don't miss"), anything implying a
 * request they never made ("Your itinerary is ready"), and discounts, which
 * do not exist. A trip with no full free day gets "what to do near <town>".
 */
export function upsellSubject(p: Pick<TourUpsellProps, 'firstName' | 'town' | 'freeDays'>): string {
  const d = p.freeDays
  const core = d != null && d >= 2 ? `your ${d} free days in ${p.town}` : d === 1 ? `your free day in ${p.town}` : `what to do near ${p.town}`
  return p.firstName ? `${p.firstName}, ${core}` : cap(core)
}

/** The inbox line after the subject: what is inside, priced honestly. */
export function upsellPreheader(p: Pick<TourUpsellProps, 'party' | 'picks'>): string {
  const n = p.picks.length
  const what = n === 1 ? 'One tour that fits your trip' : `${cap(WORDS[n] ?? String(n))} tours that fit your trip`
  return `${what}, priced for ${partyPhrase(p.party)} with hotel pickup.`
}

const body: React.CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: INK }
const soft: React.CSSProperties = { ...body, color: INK_SOFT }
const small: React.CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, color: MUTED }
/** A link on its own line: padded to a 44px tap target (WCAG 2.5.8 asks 24px; 44 is the touch norm). */
const tapLink: React.CSSProperties = { display: 'inline-block', padding: '12px 0', color: LINK, fontWeight: 600, fontSize: 15, textDecoration: 'underline' }

export default function TourUpsell(props: TourUpsellProps) {
  const { hotel, arrivalLabel, tourDayLabel, party, childAware, picks, eat, exploreUrl, unsubscribeUrl, postalAddress, supportEmail } = props
  const price = picks.length > 1 ? 'Every price is' : 'The price is'

  return (
    <MaplLayout preheader={upsellPreheader(props)} title={upsellSubject(props)}>
      <Text style={{ margin: '0 0 12px', fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GREEN }}>
        Your airport ride is booked
      </Text>
      <Heading as="h1" className="mapl-h1" style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: INK }}>
        {upsellHeadline(props)}
      </Heading>

      <Text style={{ ...soft, margin: '16px 0 0' }}>
        When you land on {arrivalLabel}, your driver will be waiting at arrivals with your name on a sign. After that, the days at {hotel} are yours, and {picks.length > 1 ? 'these are the tours that fit best' : 'this is the tour that fits best'} from there.
      </Text>
      <Text style={{ ...soft, margin: '16px 0 0' }}>
        {`${price} for ${partyPhrase(party)}, with hotel pickup and drop-off included.${childAware ? ' We only picked tours that suit the youngest in your party.' : ''}`}
      </Text>

      {picks.map((p) => (
        <Section key={p.bookUrl} style={{ margin: '24px 0 0', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>
          <Link href={p.detailsUrl}>
            <Img src={p.imageUrl} alt={`${p.title}`} width={600} height={450} style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto', border: 0 }} />
          </Link>
          <Section style={{ padding: '24px 20px 24px' }}>
            {p.shortest ? (
              <Text style={{ margin: '0 0 8px', display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: GREEN_TINT, color: GREEN_DEEP, fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>
                Shortest day out
              </Text>
            ) : null}
            <Heading as="h2" style={{ margin: 0, fontFamily: FONT, fontSize: 20, lineHeight: 1.25, fontWeight: 700, color: INK }}>
              {p.title}
            </Heading>
            <Text style={{ ...soft, margin: '8px 0 0' }}>{p.description}</Text>
            <Text style={{ ...small, margin: '8px 0 0' }}>
              {[p.duration, p.doorToDoor, p.ages].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ margin: '16px 0 0', fontFamily: FONT, color: INK }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>{`$${p.total}`}</span>
              <span style={{ fontSize: 15, color: INK_SOFT }}>{` for ${partyPhrase(party)}, pickup included`}</span>
            </Text>
            <Section style={{ margin: '16px 0 0' }}>
              {/* Full width by its own inline style, not by the phone media query, so
                  clients that drop <style> still give a card-wide tap target. */}
              <Button href={p.bookUrl} style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '15px 24px', background: INK, color: '#FFFFFF', borderRadius: 999, textDecoration: 'none', fontFamily: FONT, fontSize: 16, fontWeight: 700 }}>
                {`Book for ${tourDayLabel}`}
              </Button>
            </Section>
            <Text style={{ ...small, margin: '8px 0 0' }}>
              Your day and party are filled in. Change either before you pay.
            </Text>
            <Text style={{ ...small, margin: 0 }}>
              <Link href={p.detailsUrl} style={tapLink}>
                See photos and details
              </Link>
            </Text>
          </Section>
        </Section>
      ))}

      {eat ? (
        <Section style={{ margin: '32px 0 0', padding: '16px 20px', borderRadius: 12, background: PAPER, border: `1px solid ${BORDER}` }}>
          <Text style={{ margin: 0, fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GREEN }}>
            And when you are hungry
          </Text>
          <Text style={{ ...body, margin: '8px 0 0' }}>
            <strong>{eat.name}</strong> in {eat.town}. {eat.description}
          </Text>
          <Text style={{ ...small, margin: 0 }}>
            <Link href={eat.mapsUrl} style={tapLink}>
              Directions
            </Link>
            {' '}· We do not book this one. We just think you should go.
          </Text>
        </Section>
      ) : null}

      <Text style={{ ...body, margin: '32px 0 0' }}>
        Something else in mind, or a different day? Just reply and tell us what you are into, and one of us will write back within 24 hours. These are the closest fits to your hotel, and{' '}
        <Link href={exploreUrl} style={{ color: LINK, fontWeight: 600, textDecoration: 'underline' }}>
          every other tour is here
        </Link>
        .
      </Text>

      <Hr style={{ borderColor: BORDER, margin: '32px 0 0' }} />
      <Text style={{ ...small, margin: '16px 0 0' }}>
        {props.picks.some((p) => p.doorToDoor) ? 'Door to door means from your hotel and back, with time at the activity included. ' : ''}
        This is the only email we send about tours for this trip. You are getting it because you booked an airport ride with MAPL Tours Jamaica.{' '}
        <Link href={unsubscribeUrl} style={{ color: LINK, textDecoration: 'underline' }}>
          Stop these emails
        </Link>
        .
      </Text>
      <Text style={{ ...small, margin: '8px 0 0' }}>
        Questions? Reply, or write to{' '}
        <Link href={`mailto:${supportEmail}`} style={{ color: LINK, textDecoration: 'underline' }}>
          {supportEmail}
        </Link>
        .{postalAddress ? ` ${postalAddress}.` : ''}
      </Text>
    </MaplLayout>
  )
}
