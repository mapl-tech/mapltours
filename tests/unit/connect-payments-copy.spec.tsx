import { describe, test, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The site footer is irrelevant to what the connector page promises.
vi.mock('@/components/Footer', () => ({ default: () => null }))

import ConnectPage from '../../app/connect/page'
import { GET } from '../../app/llms.txt/route'

/**
 * /connect and llms.txt are built static and tell travellers and directory
 * reviewers what the connector does. book_and_pay_transfer is listed only when
 * agentPaymentsEnabled() is true, so both pages read the same switch: with it
 * off they must never mention paying in the chat, and with it on they must
 * stop saying the connector never charges or never learns who you are.
 */

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&rsquo;|’/g, "'")
    .replace(/\s+/g, ' ')

function connect(on: boolean) {
  vi.stubEnv('AGENT_PAYMENTS_ENABLED', on ? '1' : '')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
  return text(renderToStaticMarkup(<ConnectPage />))
}

async function llms(on: boolean) {
  vi.stubEnv('AGENT_PAYMENTS_ENABLED', on ? '1' : '')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
  return GET().text()
}

afterEach(() => vi.unstubAllEnvs())

describe('/connect follows the payments switch', () => {
  test('off: link-only promises, no payment tool', () => {
    const page = connect(false)
    expect(page).toContain('It books and charges nothing on its own')
    expect(page).toContain('Your name, email and phone do not pass through the connector')
    expect(page).toContain('Every tool is read-only')
    expect(page).not.toContain('book_and_pay_transfer')
    expect(page).not.toMatch(/pay for you|payment token/i)
  })

  test('on: names the tool, says what it sends, and drops every claim it would break', () => {
    const page = connect(true)
    expect(page).toContain('book_and_pay_transfer')
    expect(page).toContain('Not listed at the Claude and ChatGPT addresses')
    expect(page).toContain('only after you approve the exact price')
    expect(page).toContain('sends us your name, email and phone')
    expect(page).toContain('Your card number never reaches us')
    for (const broken of [
      'It books and charges nothing on its own',
      'do not pass through the connector',
      'The connector does not know who you are',
      'Every tool is read-only',
    ]) expect(page).not.toContain(broken)
  })

  test('the switch needs a Stripe key too, like the server', () => {
    vi.stubEnv('AGENT_PAYMENTS_ENABLED', '1')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect(text(renderToStaticMarkup(<ConnectPage />))).not.toContain('book_and_pay_transfer')
  })

  test.each([false, true])('payments %s: no em dash in the copy', (on) => {
    expect(connect(on)).not.toContain('—')
  })
})

describe('llms.txt follows the payments switch', () => {
  test('off: no payment tool', async () => {
    expect(await llms(false)).not.toContain('book_and_pay_transfer')
  })
  test('on: the tool, rides only, and the addresses that never list it', async () => {
    const body = await llms(true)
    expect(body).toContain('book_and_pay_transfer, books and pays for an airport ride')
    expect(body).toContain('not listed at the ?via=claude and ?via=chatgpt addresses')
    expect(body).toContain('Tours are always paid on the checkout page')
  })
})
