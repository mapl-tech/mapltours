import type { CSSProperties, ReactNode } from 'react'
import { breakable } from './breakable'
import CopyAddress from './CopyAddress'
import CopyPrompt from './CopyPrompt'
import { FONT, GOLD_EDGE, GOLD_TINT, LINK, LINK_BLOCK, SUPPORT_SIZE } from './tokens'

/**
 * How to add the connector to each assistant, for /connect.
 *
 * Every step was checked against the assistant's own help page (listed in
 * `sources`, and linked under the steps) on 1 October 2026. Where a vendor's
 * pages disagree or a menu name could not be confirmed, the step says what
 * to do in words that hold either way rather than guessing a label. Re-check
 * these when a vendor renames a menu: a wrong menu name is the fastest way to
 * lose someone halfway through.
 *
 * Each assistant gets its own address (/mcp?via=...), which credits a booking
 * to it (lib/agent/booking-link).
 */

export const MCP_URL = 'https://mapltours.com/mcp'

export interface Guide {
  id: 'muse' | 'claude' | 'chatgpt' | 'gemini' | 'perplexity'
  /** The assistant's name as its maker writes it. */
  name: string
  /**
   * Steps after "Copy your address", which is always step 1. The last one
   * ends on asking about the trip; the panel adds a sample request to copy.
   */
  steps: ReactNode[]
  note: ReactNode
  sources: { label: string; href: string }[]
}

const B = ({ children }: { children: ReactNode }) => (
  <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{children}</strong>
)

export const GUIDES: Guide[] = [
  {
    id: 'muse',
    name: 'Muse',
    steps: [
      <>
        Ask Muse to <B>create a Custom Connector</B> for MAPL Tours Jamaica.
      </>,
      <>Paste the address when Muse asks for it. Muse guides you through the rest, and there is nothing to sign in to.</>,
      <>Then ask Muse about your ride or tour.</>,
    ],
    note: (
      <>
        Meta does not review custom connectors and suggests reading the provider’s privacy policy first. Ours is
        short; it is under <a href="#privacy" className="tap-target" style={LINK}>Privacy</a> below.
      </>
    ),
    sources: [
      { label: 'Meta Help Center: How Muse works with Connectors', href: 'https://www.meta.com/help/artificial-intelligence/1687253048996149/' },
    ],
  },
  {
    id: 'claude',
    name: 'Claude',
    steps: [
      <>
        In Claude, go to <B>Customize</B>, then <B>Connectors</B>. Choose <B>+ Add</B>, then <B>Add custom connector</B>.
      </>,
      <>
        Name it MAPL Tours Jamaica, paste the address and continue. Under <B>Authentication</B>, pick <B>No sign in</B>,
        then choose <B>Add</B>.
      </>,
      <>
        In a chat, open the <B>+</B> menu, choose <B>Connectors</B> and switch on MAPL Tours Jamaica. Then ask about your
        ride or tour.
      </>,
    ],
    note: (
      <>
        Free plans can add one custom connector. On a Team or Enterprise plan, an owner adds it first in{' '}
        <B>Organization settings</B>, and then you connect it from <B>Customize</B>, <B>Connectors</B>.
      </>
    ),
    sources: [
      {
        label: 'Claude Help Center: Get started with custom connectors using remote MCP',
        href: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
      },
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    steps: [
      <>
        On chatgpt.com, open <B>Settings</B> and turn on <B>Developer mode</B>.
      </>,
      <>
        Create a new app from an MCP server (ChatGPT lists these as apps or plugins). Name it MAPL Tours Jamaica, paste
        the address as the server URL, choose no authentication, and create it.
      </>,
      <>
        In a new chat, open the <B>+</B> menu and pick MAPL Tours Jamaica (it may sit under <B>Developer mode</B>). Then
        ask about your ride or tour.
      </>,
    ],
    note: (
      <>
        Developer mode is on the web only, for Plus, Pro, Business, Enterprise and Edu plans. On a work plan, an admin
        may need to allow it first.
      </>
    ),
    sources: [
      { label: 'OpenAI: ChatGPT developer mode', href: 'https://developers.openai.com/api/docs/guides/developer-mode' },
      {
        label: 'OpenAI Help Center: Developer mode and MCP apps in ChatGPT',
        href: 'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt',
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    steps: [
      <>
        On a computer, go to gemini.google.com. At the bottom, click <B>Settings</B>, then <B>Connected Apps</B>. If you
        do not see Connected Apps, open <B>Personal Intelligence</B> first.
      </>,
      <>
        Under <B>Custom apps</B>, add a custom app with the address and click <B>Next</B>. Follow the steps on screen;
        there is nothing to sign in to.
      </>,
      <>
        In a chat, type <B>@</B> and pick MAPL Tours Jamaica (this works in the Gemini mobile app too), then ask about
        your ride or tour.
      </>,
    ],
    note: (
      <>
        Custom apps need a personal Google Account with Keep Activity on, and you must be 18 or over and in the US.
        They are in English only for now.
      </>
    ),
    sources: [
      { label: 'Gemini Apps Help: Connect & manage custom apps', href: 'https://support.google.com/gemini/answer/17209137' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    steps: [
      <>
        Go to <B>Account settings</B>, then <B>Connectors</B>, and click <B>+ Custom connector</B>. Choose <B>Remote</B>.
      </>,
      <>
        Name it MAPL Tours Jamaica and paste the address as the <B>MCP Server URL</B>. Set <B>Authentication</B> to{' '}
        <B>None</B> and <B>Transport</B> to <B>Streamable HTTP</B>, tick the acknowledgement box, then click <B>Add</B>.
      </>,
      <>Click the MAPL Tours Jamaica card to switch it on, then ask about your ride or tour.</>,
    ],
    note: (
      <>
        Custom connectors are for Pro, Max and Enterprise subscribers. On Enterprise, an admin may need to let members
        add their own.
      </>
    ),
    sources: [
      {
        label: 'Perplexity Help Center: Adding Custom Remote Connectors',
        href: 'https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors',
      },
    ],
  },
]

// Tinted, not solid gold: the numbers guide the eye down the steps without
// outshouting the copy button, the one filled control in the panel.
const disc: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: GOLD_TINT,
  border: `1px solid ${GOLD_EDGE}`,
  color: 'var(--gold-ink)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
}

/**
 * One numbered step. `after` (the copy row) spans the whole card under the
 * step: indented to the text on wider screens, full width on a phone, where
 * the extra 48px keeps the address on two clean lines. The indent is fluid
 * (0 below 480px, 48px from 576px), so it needs no media query.
 *
 * The disc is decoration; screen readers get "Step 3:" from hidden text, so
 * the hint under the address ("You paste it in step 3") points at a number
 * they can hear. Inside a step, 8px; between steps, 24px (the list's gap),
 * so a step's copy row and hint read as part of their own step.
 */
function Step({ n, children, after }: { n: number; children: ReactNode; after?: ReactNode }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 16, rowGap: 8, alignItems: 'start' }}>
      <span aria-hidden="true" style={disc}>
        {n}
      </span>
      <div style={{ maxWidth: '68ch', paddingTop: 4, fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: 'var(--text-primary)' }}>
        <span className="visually-hidden">Step {n}: </span>
        {children}
      </div>
      {after && (
        <div style={{ gridColumn: '1 / -1', paddingLeft: 'clamp(0px, calc((100vw - 480px) / 2), 48px)' }}>{after}</div>
      )}
    </li>
  )
}

// The address and the sample request as plain text, for the steps shown
// with JavaScript off (the copy buttons need it).
const plainAddress: CSSProperties = {
  display: 'block',
  padding: '12px 16px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  fontFamily: FONT,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
}

// Selecting the inline run, not the block, keeps a line break out of the copy.
const selectAll: CSSProperties = { userSelect: 'all', WebkitUserSelect: 'all' }

const plainNote: CSSProperties = { margin: '8px 0 0', fontFamily: FONT, fontSize: 16, lineHeight: 1.45, color: 'var(--text-secondary)' }

/**
 * One assistant's steps, as the panel of its tab. `ask` is the sample request
 * the last step offers to copy. `interactive={false}` renders the same steps
 * with no client components (the address and the request as selectable text,
 * and no element ids), for the <noscript> copy of the panels.
 */
export function GuidePanel({ guide, ask, interactive = true }: { guide: Guide; ask: string; interactive?: boolean }) {
  const address = `${MCP_URL}?via=${guide.id}`
  const last = guide.steps.length - 1
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'clamp(16px, 4vw, 32px)',
      }}
    >
      <h3
        id={interactive ? `${guide.id}-title` : undefined}
        style={{
          margin: 0,
          fontFamily: FONT,
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
        }}
      >
        Add MAPL Tours Jamaica to {guide.name}
      </h3>
      <ol role="list" style={{ listStyle: 'none', margin: '24px 0 0', padding: 0, display: 'grid', gap: 24 }}>
        <Step
          n={1}
          after={
            interactive ? (
              <CopyAddress address={address} pasteInto={guide.name} hint="You paste it in step 3." nameSuffix={`for ${guide.name}`} />
            ) : (
              <>
                <span translate="no" style={plainAddress}>
                  <span style={selectAll}>{breakable(address)}</span>
                </span>
                <p style={plainNote}>You paste it in step 3.</p>
              </>
            )
          }
        >
          Copy your {guide.name} address.
        </Step>
        {guide.steps.map((s, i) => (
          <Step
            key={i}
            n={i + 2}
            after={
              i === last ? (
                interactive ? (
                  <CopyPrompt text={ask} />
                ) : (
                  <p style={{ ...plainNote, margin: 0, color: 'var(--text-primary)' }}>“{ask}”</p>
                )
              ) : undefined
            }
          >
            {s}
            {i === last && ' Try this one:'}
          </Step>
        ))}
      </ol>
      <p
        style={{
          margin: '24px 0 0',
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--r-md)',
          fontFamily: FONT,
          fontSize: SUPPORT_SIZE,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}
      >
        <B>Good to know:</B> {guide.note}
      </p>
      <p style={{ margin: '16px 0 0', fontFamily: FONT, fontSize: SUPPORT_SIZE, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {guide.sources.length > 1 ? 'Sources: ' : 'Source: '}
        {guide.sources.map((s, i) => (
          <span key={s.href}>
            {i > 0 && (i === guide.sources.length - 1 ? ' and ' : ', ')}
            <a href={s.href} className="tap-target" style={LINK_BLOCK}>
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}
