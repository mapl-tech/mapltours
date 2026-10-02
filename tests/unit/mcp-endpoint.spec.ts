/**
 * The /mcp endpoint, driven by the official MCP client against the real route
 * handler: a 2025-era client (the v2 client's default, plain initialize) and a
 * 2026-07-28 client (pinned), plus raw HTTP for the edges.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { DELETE, GET, HEAD, OPTIONS, POST } from '@/app/mcp/route'
import { getTransferPrice } from '@/lib/airport-transfers'
import { parseHandoff } from '@/lib/agent/booking-link'

const NAMES = [
  'find_transfer_destination',
  'get_transfer_quote',
  'check_transfer_timing',
  'start_transfer_booking',
  'list_tours',
  'get_tour',
  'start_tour_booking',
  'get_booking_terms',
]

const routeFetch = (url: string | URL, init?: RequestInit) => POST(new Request(url, init))

async function connect(via: string, era: 'legacy' | 'modern', host = 'mapltours.com') {
  const client = new Client(
    { name: 'mapl-test', version: '1.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  )
  const transport = new StreamableHTTPClientTransport(new URL(`https://${host}/mcp?via=${via}`), { fetch: routeFetch as never })
  await client.connect(transport)
  return client
}

const struct = (r: unknown) => (r as { structuredContent?: Record<string, unknown> }).structuredContent ?? {}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each(['legacy', 'modern'] as const)('%s-era client', (era) => {
  test('lists the eight tools in a fixed order, each titled and fully annotated', async () => {
    const client = await connect('muse', era)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(NAMES)
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy()
      expect(t.description!.length, t.name).toBeLessThan(1000)
      expect(t.inputSchema.type).toBe('object')
      const a = t.annotations!
      expect(typeof a.readOnlyHint, t.name).toBe('boolean')
      expect(a.destructiveHint, t.name).toBe(false)
      expect(typeof a.idempotentHint, t.name).toBe('boolean')
      expect(typeof a.openWorldHint, t.name).toBe('boolean')
      // Nothing listed without the payment switch writes, books or charges.
      expect(a.readOnlyHint, t.name).toBe(true)
    }
    await client.close()
  })

  test('quotes the rate card exactly', async () => {
    const client = await connect('muse', era)
    const r = await client.callTool({ name: 'get_transfer_quote', arguments: { destination: 'riu-negril', trip_type: 'round_trip', passengers: 2 } })
    expect(r.isError).toBeFalsy()
    expect(struct(r).priceUsd).toBe(getTransferPrice('riu-negril', 'round_trip', 2))
    await client.close()
  })

  test('a ride booking link opens to exactly the validated ride', async () => {
    const client = await connect('muse', era)
    const r = await client.callTool({
      name: 'start_transfer_booking',
      arguments: {
        destination: 'Riu Negril',
        trip_type: 'round_trip',
        passengers: 2,
        arrival_at: '2027-03-05T14:30',
        arrival_flight: 'aa 1234',
        departure_flight_at: '2027-03-12T16:05',
        departure_flight: 'AA1235',
      },
    })
    expect(r.isError).toBeFalsy()
    const s = struct(r)
    expect(s.status).toBe('booking_link_ready')
    const url = new URL(String(s.bookingUrl))
    expect(url.origin + url.pathname).toBe('https://mapltours.com/book')
    expect(url.searchParams.get('utm_source')).toBe('muse')
    expect(url.searchParams.get('utm_medium')).toBe('ai_agent')
    const parsed = parseHandoff(url.searchParams, new Date('2026-10-01T12:00:00Z'))
    expect(parsed).toEqual({
      ok: true,
      handoff: {
        kind: 'ride',
        destinationId: 'riu-negril',
        tripType: 'round_trip',
        passengers: 2,
        fromAirport: true,
        arrivalAt: '2027-03-05T14:30',
        arrivalFlight: 'AA1234',
        departureAt: '2027-03-12T12:35',
        departureFlight: 'AA1235',
      },
    })
    await client.close()
  })

  test("links name mapltours.com even when the function sees Netlify's per-deploy host", async () => {
    // Behind the custom domain the request URL is <deploy id>--mapltours.netlify.app.
    const client = await connect('muse', era, '6abfa9bd03b6d300087ad7f1--mapltours.netlify.app')
    const quote = await client.callTool({ name: 'get_transfer_quote', arguments: { destination: 'riu-negril', trip_type: 'round_trip', passengers: 2 } })
    const tour = await client.callTool({ name: 'start_tour_booking', arguments: { tour: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-03-07' } })
    for (const r of [quote, tour]) {
      const url = new URL(String(struct(r).bookingUrl))
      expect(url.origin + url.pathname).toBe('https://mapltours.com/book')
    }
    await client.close()
  })

  test('a refused ride comes back as a tool error the assistant can act on', async () => {
    const client = await connect('claude', era)
    const r = await client.callTool({ name: 'start_transfer_booking', arguments: { destination: 'riu-negril', trip_type: 'one_way', passengers: 2 } })
    expect(r.isError).toBe(true)
    expect(JSON.stringify(r.content)).toContain('direction is required')
    await client.close()
  })
})

describe('the payment tool', () => {
  test('is not listed while agent payments are switched off', async () => {
    const client = await connect('muse', 'modern')
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).not.toContain('book_and_pay_transfer')
    await client.close()
  })

  test.each([
    ['muse', true],
    ['gemini', true],
    ['mcp', true],
    ['claude', false],
    ['chatgpt', false],
  ])('with payments on, via=%s lists it: %s', async (via, listed) => {
    vi.stubEnv('AGENT_PAYMENTS_ENABLED', '1')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy')
    const client = await connect(via, 'modern')
    const { tools } = await client.listTools()
    const pay = tools.find((t) => t.name === 'book_and_pay_transfer')
    expect(!!pay).toBe(listed)
    if (pay) {
      expect(pay.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true })
      expect(pay.inputSchema.required).toEqual(['destination', 'trip_type', 'passengers', 'guest', 'approved_total_usd', 'shared_payment_token'])
    }
    await client.close()
  })
})

describe('HTTP edges', () => {
  test('a client asking GET for a stream, and DELETE, get 405 with a pointer to the connect page', async () => {
    for (const res of [GET(new Request('https://mapltours.com/mcp', { headers: { accept: 'text/event-stream' } })), DELETE()]) {
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('POST, OPTIONS')
      expect(await res.text()).toContain('https://mapltours.com/connect')
    }
  })

  test('a person or a reachability check reading the address gets 200 and what it is', async () => {
    for (const accept of ['text/html', '*/*', '']) {
      const res = GET(new Request('https://mapltours.com/mcp', { headers: accept ? { accept } : {} }))
      expect(res.status, accept).toBe(200)
      expect(await res.text()).toContain('https://mapltours.com/connect')
    }
    const head = HEAD(new Request('https://mapltours.com/mcp'))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  test('CORS preflight is answered for browser-based MCP clients', () => {
    const res = OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('MCP-Protocol-Version')
  })

  test('no subscription streams, and the tool list says it never changes', async () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} }
    const post = (id: number, method: string, params: Record<string, unknown>) =>
      POST(new Request('https://mapltours.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: meta } }),
      }))
    const discover = await (await post(1, 'server/discover', {})).text()
    expect(discover).toContain('"listChanged":false')
    const listen = await post(2, 'subscriptions/listen', { filter: { toolsListChanged: true } })
    const text = await Promise.race([listen.text(), new Promise<string>((r) => setTimeout(() => r('STILL OPEN'), 1500))])
    expect(text).not.toBe('STILL OPEN')
    expect(text).toContain('error')
  })

  test('server/discover names the server and both protocol eras', async () => {
    const res = await POST(
      new Request('https://mapltours.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('mapltours-jamaica')
    expect(JSON.stringify(body)).toContain('2026-07-28')
  })
})

describe('simple clients and directory checkers', () => {
  // Spec clients accept JSON and SSE; checkers often send one, the fetch default, or nothing.
  const rpc = (accept: string | null, method: string, params: Record<string, unknown> = {}, id: number | null = 1) =>
    POST(
      new Request('https://mapltours.com/mcp?via=muse', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(accept === null ? {} : { accept }) },
        body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
      }),
    )
  const init = { capabilities: {}, clientInfo: { name: 'checker', version: '1' } }

  test.each([
    ['application/json', '2025-06-18'],
    ['*/*', '2025-06-18'],
    [null, '2025-03-26'],
    ['application/json, text/event-stream', '2024-11-05'],
  ])('initialize with Accept %s (%s) is answered in plain JSON', async (accept, protocolVersion) => {
    const res = await rpc(accept, 'initialize', { protocolVersion, ...init })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.result.serverInfo.name).toBe('mapltours-jamaica')
    expect(body.result.protocolVersion).toBe(protocolVersion)
  })

  test('tools/list and tools/call answer a checker that accepts only JSON', async () => {
    const list = await (await rpc('application/json', 'tools/list')).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(NAMES)
    const call = await (await rpc('application/json', 'tools/call', { name: 'get_transfer_quote', arguments: { destination: 'riu-negril', trip_type: 'round_trip', passengers: 2 } })).json()
    expect(call.result.structuredContent.priceUsd).toBe(getTransferPrice('riu-negril', 'round_trip', 2))
    expect(String(call.result.structuredContent.bookingUrl)).toMatch(/^https:\/\/mapltours\.com\/book\?/)
  })

  test('a client that asks for SSE alone still gets SSE', async () => {
    const res = await rpc('text/event-stream', 'tools/list')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(await res.text()).toContain('get_transfer_quote')
  })

  test('a notification is acknowledged with 202 and no body', async () => {
    const res = await rpc('application/json', 'notifications/initialized', {}, null)
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })
})
