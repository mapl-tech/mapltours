import type { CSSProperties, ReactNode } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Footer from '@/components/Footer'
import AssistantTabs from '@/components/connect/AssistantTabs'
import ChatDemo from '@/components/connect/ChatDemo'
import { LineCheck } from '@/components/connect/CheckIcon'
import CopyAddress from '@/components/connect/CopyAddress'
import CopyPrompt from '@/components/connect/CopyPrompt'
import { GUIDES, GuidePanel, MCP_URL } from '@/components/connect/guides'
import { FONT, GOLD_EDGE, GOLD_TINT, H3, LINK, LINK_BLOCK, STANDALONE_ON_DARK, SUPPORT_SIZE } from '@/components/connect/tokens'
import { buildQuote, DESTINATIONS, MAX_TRANSFER_PASSENGERS } from '@/lib/airport-transfers'
import { MIN_LEAD_TIME_HOURS } from '@/lib/booking-window'

/**
 * /connect: how a traveller adds the MAPL Tours Jamaica connector (the remote
 * MCP server at /mcp) to their AI assistant, and the docs page connector
 * directories ask for (Meta's Muse Connector Platform among them).
 *
 * Order, top to bottom, as the owner set it: what it does, the address,
 * steps per assistant, what the assistant can do, what it never does,
 * privacy, the technical facts; then the address once more, so the page ends
 * on its one action. Numbers and the example fare come from the
 * same constants and pricing function the tools and checkout use, so the
 * page cannot drift from the rate card.
 */

const TITLE = 'Book MAPL Tours Jamaica from your AI assistant'
const DESCRIPTION =
  'Add MAPL Tours Jamaica to Muse, Claude, ChatGPT, Gemini or Perplexity. Your assistant prices your Jamaica ride or tour, and you check and pay on mapltours.com.'
const PAGE_URL = 'https://mapltours.com/connect'

// A page that sets its own openGraph no longer inherits the image from
// app/opengraph-image.tsx, so the site card is named here.
const SHARE_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'MAPL Tours Jamaica, Discover Jamaica Beyond the Resort' }

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: 'website',
    siteName: 'MAPL Tours Jamaica',
    locale: 'en_US',
    images: [SHARE_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE.url] },
}

const TOOLS = [
  'find_transfer_destination',
  'get_transfer_quote',
  'check_transfer_timing',
  'start_transfer_booking',
  'list_tours',
  'get_tour',
  'start_tour_booking',
  'get_booking_terms',
]

/** The worked example in the chat: a real hotel, priced by the checkout's own function. */
const DEMO_HOTEL_ID = 'riu-negril'
const DEMO_PARTY = 4

const SECTION: CSSProperties = { paddingTop: 'clamp(56px, 9vw, 88px)', scrollMarginTop: 'var(--nav-h)' }
const H2: CSSProperties = {
  margin: 0,
  fontFamily: FONT,
  fontSize: 'clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem)',
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.015em',
  color: 'var(--text-primary)',
}
const INTRO: CSSProperties = {
  margin: '12px 0 0',
  maxWidth: '62ch',
  fontFamily: FONT,
  fontSize: 17,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}
const BODY: CSSProperties = { fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)' }
const LIST: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      translate="no"
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.5,
        color: 'var(--text-primary)',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </span>
  )
}

function Fact({ term, first, children }: { term: string; first?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        columnGap: 24,
        rowGap: 8,
        padding: '16px 0',
        borderTop: first ? 'none' : '1px solid var(--border)',
      }}
    >
      <dt style={{ flex: '0 0 168px', fontFamily: FONT, fontSize: 15, fontWeight: 700, lineHeight: 1.6, color: 'var(--text-primary)' }}>
        {term}
      </dt>
      <dd
        style={{
          flex: '1 1 300px',
          minWidth: 0,
          margin: 0,
          fontFamily: FONT,
          fontSize: SUPPORT_SIZE,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </dd>
    </div>
  )
}

export default function ConnectPage() {
  const demo = buildQuote(DEMO_HOTEL_ID, 'round_trip', DEMO_PARTY)
  // zoneDuration joins the range with an en dash (U+2013), "75 [dash] 90 min from MBJ";
  // the page writes it out as "75 to 90 minutes".
  const span = demo?.zoneDuration.match(/(\d+)\s*\D\s*(\d+)\s*min/)
  const drive = span ? `${span[1]} to ${span[2]}\u00A0minutes` : null
  const hotel = demo?.destinationName ?? 'Riu Negril'
  // The first thing to ask once it is added: short, and priced by the same tool as the chat below.
  const ask = `Price a private ride from Montego Bay airport to ${hotel} for two.`

  const canDo: { title: string; text: string }[] = [
    {
      title: 'Find your hotel',
      // Named properties only: the "Other hotel or villa" entries are per-area catch-alls, not places.
      text: `Search the ${DESTINATIONS.filter((d) => !d.id.endsWith('-other')).length} hotels and villas we drive to by name, or any other in Montego Bay, Negril, Ocho Rios, Falmouth and Lucea.`,
    },
    {
      title: 'Price your airport ride',
      text: `An all-in price for a private ride from Sangster airport (MBJ), one way or round trip. One price per vehicle for up to 4 people; 5 to ${MAX_TRANSFER_PASSENGERS} are priced per person.`,
    },
    {
      title: 'Check your pickup times',
      text: `Every pickup needs ${MIN_LEAD_TIME_HOURS} hours’ notice, in Jamaica time. It checks yours and works out when to leave your hotel for the flight home.`,
    },
    {
      title: 'Find a tour',
      text: 'Our tours and day packages with hotel pickup, what each one includes, and the exact price for your group.',
    },
    {
      // The payoff, last and full width. Four before it keep the grid whole.
      title: 'Set up the booking',
      text: 'It tells you what is included and how cancellation works, then makes a mapltours.com link that opens checkout with your ride or tour, dates and party already filled in.',
    },
  ]

  return (
    <div style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="container" style={{ maxWidth: 824 }}>
        {/* What it does, and the address. */}
        <header style={{ paddingTop: 'clamp(32px, 6vw, 72px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Image
              src="/mcp/icon-512.png"
              alt=""
              width={48}
              height={48}
              loading="eager"
              style={{ flex: '0 0 auto', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)' }}
            />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                MAPL Tours Jamaica connector
              </p>
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 15, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                For Muse, Claude, ChatGPT, Gemini and Perplexity
              </p>
            </div>
          </div>

          <h1
            style={{
              margin: '24px 0 0',
              maxWidth: '20ch',
              fontFamily: FONT,
              fontSize: 'var(--fs-h1)',
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              textWrap: 'balance',
            }}
          >
            Book MAPL Tours Jamaica from your AI assistant
          </h1>
          <p
            style={{
              margin: '16px 0 0',
              maxWidth: '58ch',
              fontFamily: FONT,
              fontSize: 'clamp(1.0625rem, 1rem + 0.35vw, 1.1875rem)',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
            }}
          >
            Add one address and your assistant can price your airport ride or tour from our live rates, then hand you a
            booking link with everything filled in.
          </p>

          <div
            id="address"
            style={{
              marginTop: 32,
              scrollMarginTop: 'calc(var(--nav-h) + 24px)',
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-md)',
              padding: 'clamp(16px, 3vw, 24px)',
            }}
          >
            <CopyAddress
              address={MCP_URL}
              label="Connector address"
              hint="Paste it into your assistant’s connector settings. The steps are just below."
            />
            <p
              style={{
                ...BODY,
                display: 'flex',
                gap: 8,
                margin: '16px 0 0',
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
                fontSize: SUPPORT_SIZE,
                color: 'var(--text-primary)',
              }}
            >
              <LineCheck />
              <span>
                No sign-in and nothing to install. It books and charges nothing on its own: you check the details and
                pay on mapltours.com.
              </span>
            </p>
          </div>
        </header>

        {/* Step by step, one assistant at a time. */}
        <section id="add" aria-labelledby="add-title" style={SECTION}>
          <h2 id="add-title" style={H2}>
            Add it to your assistant
          </h2>
          <p style={INTRO}>
            Pick yours and follow four short steps. Each assistant has its own address, and the one above works in all
            of them.
          </p>
          <div style={{ marginTop: 24 }}>
            <AssistantTabs
              label="Your assistant"
              tabs={GUIDES.map((g) => ({ id: g.id, label: g.name, panel: <GuidePanel guide={g} ask={ask} /> }))}
            />
          </div>
          {/* With JavaScript off the tabs cannot switch, so the other assistants' steps follow in full. */}
          <noscript>
            <p style={{ ...BODY, margin: '16px 0 0' }}>The tabs need JavaScript, so here are the steps for the other assistants.</p>
            <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
              {GUIDES.slice(1).map((g) => (
                <GuidePanel key={g.id} guide={g} ask={ask} interactive={false} />
              ))}
            </div>
          </noscript>
          <p style={{ ...BODY, margin: '16px 0 0', fontSize: SUPPORT_SIZE }}>
            Using another assistant? Paste the address above wherever it adds a remote MCP server or custom connector,
            with no sign-in.
          </p>
        </section>

        {/* Shown first, then listed: a worked chat, then every ability in plain words. */}
        <section id="what-it-can-do" aria-labelledby="can-title" style={SECTION}>
          <h2 id="can-title" style={H2}>
            What your assistant can do
          </h2>
          <p style={INTRO}>It works from our live rate card and booking rules, the same ones our own checkout uses.</p>
          <div style={{ marginTop: 24 }}>
            <ChatDemo
              hotel={hotel}
              passengers={DEMO_PARTY}
              fareUsd={demo ? demo.priceUsd : null}
              drive={drive}
            />
          </div>
          <ul
            role="list"
            style={{ ...LIST, marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}
          >
            {canDo.map((c, i) => {
              // The last ability is the payoff the others lead to: it spans the
              // row and carries the "yours" tint, so the grid ends on it.
              const payoff = i === canDo.length - 1
              return (
              <li
                key={c.title}
                data-reveal
                style={
                  {
                    '--i': i,
                    gridColumn: payoff ? '1 / -1' : undefined,
                    background: payoff ? GOLD_TINT : '#fff',
                    border: `1px solid ${payoff ? GOLD_EDGE : 'var(--border)'}`,
                    borderRadius: 'var(--r-xl)',
                    boxShadow: 'var(--shadow-xs)',
                    padding: 24,
                  } as CSSProperties
                }
              >
                <h3 style={H3}>{c.title}</h3>
                <p style={{ ...BODY, margin: '8px 0 0', fontSize: SUPPORT_SIZE }}>{c.text}</p>
              </li>
              )
            })}
          </ul>
          <h3 style={{ ...H3, marginTop: 24 }}>Try asking</h3>
          <ul role="list" style={{ ...LIST, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              `How much is a private ride from MBJ to ${hotel} and back, for four of us?`,
              'What would the Dunn’s River Falls climb cost for three of us next Thursday?',
              'Our flight home leaves at 4\u00A0pm. When should the driver pick us up in Negril?',
            ].map((q) => (
              <li key={q} style={{ maxWidth: '100%' }}>
                <CopyPrompt text={q} />
              </li>
            ))}
          </ul>
        </section>

        {/* The promise, on dark ground so it is not skimmed past. */}
        <section id="never" aria-labelledby="never-title" style={SECTION}>
          <div
            data-reveal
            style={{
              background: 'var(--bg-dark)',
              borderRadius: 'var(--r-xl)',
              padding: 'clamp(24px, 4vw, 32px)',
              color: '#fff',
            }}
          >
            <h2 id="never-title" style={{ ...H2, color: '#fff' }}>
              What it never does
            </h2>
            <ul role="list" style={{ ...LIST, marginTop: 16 }}>
              {[
                {
                  lead: 'It never books or charges on its own.',
                  text: 'Your assistant hands you a link. You check every detail on mapltours.com and pay there, by card, or with Apple Pay, Google Pay or Link where your device offers them.',
                },
                {
                  lead: 'It never asks who you are.',
                  text: 'Your name, email and phone do not pass through the connector. You type them on the checkout page yourself.',
                },
                {
                  lead: 'It cannot see or change your bookings.',
                  text: 'It only prices and sets up new ones. For a change or a cancellation, email contact@mapltours.com.',
                },
              ].map((item, i) => (
                <li
                  key={item.lead}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '16px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-on-dark)',
                  }}
                >
                  <LineCheck color="var(--gold-warm)" lineHeight="24.65px" />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 700, lineHeight: 1.45, color: '#fff' }}>{item.lead}</p>
                    <p style={{ margin: '4px 0 0', fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: 'var(--text-on-dark-2)' }}>
                      {item.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {/* Two standalone links in a wrapping row, not inline in a sentence: on a 320px
                screen the sentence put them on adjacent lines, where their touch zones overlapped. */}
            <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border-on-dark)' }}>
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: 'var(--text-on-dark-2)' }}>
                Rather book it yourself?
              </p>
              <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', columnGap: 24, rowGap: 8, fontFamily: FONT, fontSize: 16, lineHeight: 1.6 }}>
                <Link href="/transfers" className="tap-target" style={STANDALONE_ON_DARK}>
                  Price your ride
                </Link>
                <Link href="/explore" className="tap-target" style={STANDALONE_ON_DARK}>
                  See the tours
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" style={SECTION}>
          <h2 id="privacy-title" style={H2}>
            Privacy
          </h2>
          <ul role="list" style={{ ...LIST, marginTop: 16, display: 'grid', gap: 16 }}>
            {[
              'No sign-in and no account. The connector does not know who you are.',
              'Your assistant sends only what a price needs: the hotel or tour, dates and times, flight numbers and how many are travelling.',
              'Our logs note which tool ran and whether it worked, not what you asked.',
              'Booking links carry your ride or tour, never your name, email or phone.',
              'What you tell your assistant is covered by that assistant’s own privacy policy.',
            ].map((line) => (
              <li key={line} style={{ ...BODY, display: 'flex', gap: 8 }}>
                <LineCheck />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p style={{ ...BODY, margin: '16px 0 0' }}>
            The full details are in our{' '}
            <Link href="/privacy" className="tap-target" style={LINK}>
              privacy policy
            </Link>
            .
          </p>
        </section>

        <section id="developers" aria-labelledby="dev-title" style={SECTION}>
          <h2 id="dev-title" style={H2}>
            For developers and directories
          </h2>
          <p style={INTRO}>
            A public remote MCP server for planning airport rides and tours in Jamaica. Every tool is read-only, and none
            needs a key.
          </p>
          <dl
            style={{
              margin: '24px 0 0',
              padding: '8px clamp(16px, 3vw, 24px)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
            }}
          >
            <Fact term="Endpoint" first>
              <Chip>{MCP_URL}</Chip>
            </Fact>
            <Fact term="Assistant addresses">
              <span style={{ display: 'block' }}>The endpoint with the assistant’s name added:</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {GUIDES.map((g) => (
                  <Chip key={g.id}>?via={g.id}</Chip>
                ))}
              </span>
              <span style={{ display: 'block', marginTop: 8 }}>Any other value, or none, works the same.</span>
            </Fact>
            <Fact term="Transport">MCP over streamable HTTP. POST only, JSON responses, no sessions.</Fact>
            <Fact term="Protocol versions">2026-07-28 and 2025-11-25</Fact>
            <Fact term="Authentication">None. No sign-in, API key or OAuth.</Fact>
            <Fact term="Tools">
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TOOLS.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </span>
              <span style={{ display: 'block', marginTop: 8 }}>
                All read-only. The two start_ tools return a mapltours.com/book link that opens checkout filled in.
              </span>
            </Fact>
            <Fact term="Icon">
              {/* Too long for one line on a 320px screen: the wrapping style, with breaks only after
                  the slashes (the file name stays whole, so a line never ends on its hyphen). */}
              <a href="/mcp/icon-512.png" className="tap-target" style={LINK_BLOCK}>
                mapltours.com/
                <wbr />
                mcp/
                <wbr />
                <span style={{ whiteSpace: 'nowrap' }}>icon-512.png</span>
              </a>{' '}
              (512 by 512 PNG)
            </Fact>
            <Fact term="Policies">
              <Link href="/privacy" className="tap-target" style={LINK}>
                Privacy policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="tap-target" style={LINK}>
                terms
              </Link>
            </Fact>
            <Fact term="For AI agents">
              <a href="/llms.txt" className="tap-target" style={LINK}>
                mapltours.com/llms.txt
              </a>
            </Fact>
            <Fact term="Contact">
              <a href="mailto:contact@mapltours.com" className="tap-target" style={LINK}>
                contact@mapltours.com
              </a>
            </Fact>
          </dl>
        </section>

        {/* The close repeats the opening action, so whoever reads to the end can act here. */}
        <section id="ready" aria-labelledby="ready-title" style={{ ...SECTION, paddingBottom: 'clamp(64px, 10vw, 112px)' }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-sm)',
              padding: 'clamp(16px, 3vw, 24px)',
            }}
          >
            <h2 id="ready-title" style={H2}>
              Ready when you are
            </h2>
            <p style={{ ...INTRO, margin: '8px 0 16px' }}>
              Copy the address, then follow{' '}
              <a href="#add" className="tap-target" style={LINK}>
                the steps for your assistant
              </a>
              .
            </p>
            <CopyAddress address={MCP_URL} hint="Paste it into your assistant’s connector settings." />
          </div>
        </section>
      </div>
      <Footer />
    </div>
  )
}
