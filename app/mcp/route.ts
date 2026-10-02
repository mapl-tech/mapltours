/**
 * https://mapltours.com/mcp: the MAPL Tours Jamaica connector, a remote Model
 * Context Protocol server any AI assistant can add (Meta's Muse, ChatGPT,
 * Claude, Gemini, Perplexity, Copilot...). The tools live in lib/agent.
 *
 * - Speaks both MCP eras through the official v2 SDK: 2026-07-28 (stateless
 *   per-request envelope, server/discover) and 2025-era clients through the
 *   SDK's stateless legacy fallback. No sessions, so it runs as a plain
 *   serverless function; GET and DELETE are 405.
 * - No sign-in: the tools read public prices and return booking links. The
 *   one paying tool needs a Stripe shared payment token, which only the
 *   traveller's own wallet can grant.
 * - Each directory gets its own address (/mcp?via=muse, ?via=claude...), so
 *   bookings are credited to the assistant and Claude's and ChatGPT's
 *   listings never carry the payment tool their rules forbid.
 * - Logs one line per tool call: tool, assistant, outcome, time. Never the
 *   arguments, which can hold a traveller's name, email or flight.
 */
import { createMcpHandler, fromJsonSchema, McpServer, type JsonSchemaType } from '@modelcontextprotocol/server'
import { linkOrigin, SITE, viaOf } from '@/lib/agent/booking-link'
import { buildConnectorTools, CONNECTOR_VERSION } from '@/lib/agent/connector'
import { agentPayDeps } from '@/lib/agent/pay-deps'
import { getIp, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INSTRUCTIONS =
  'MAPL Tours Jamaica runs private airport transfers between Sangster International Airport (MBJ), Montego Bay, and hotels and villas across Montego Bay, Negril, Ocho Rios, Falmouth and Lucea, plus private tours with hotel pickup. Every price comes from the live rate card, all-in, in US dollars; never quote one these tools did not return. ' +
  'A ride: find_transfer_destination, get_transfer_quote (its bookingUrl opens checkout with that ride filled in), check_transfer_timing, then start_transfer_booking for a checkout link with flights and times too. A tour: list_tours, get_tour, then start_tour_booking. ' +
  'Times are Jamaica local time (UTC-5, no daylight saving) written "YYYY-MM-DDTHH:MM". Tell the traveller the price and the cancellation terms (get_booking_terms) and get their yes before booking.'

function buildServer(request?: Request): McpServer {
  const url = new URL(request?.url ?? `${SITE}/mcp`)
  const via = viaOf(url.searchParams.get('via'))
  const origin = linkOrigin(url)
  const ip = request ? getIp(request) : 'unknown'
  const arrived = Number(request?.headers.get(RECEIVED_AT) ?? '')
  const server = new McpServer(
    { name: 'mapltours-jamaica', title: 'MAPL Tours Jamaica', version: CONNECTOR_VERSION, websiteUrl: SITE },
    {
      instructions: INSTRUCTIONS,
      // The tool list never changes while a client is connected; say so, so
      // no client holds a stream open waiting for a change.
      capabilities: { tools: { listChanged: false } },
      // The list is the same for every caller of one address; five minutes
      // lets clients and shared caches reuse it.
      cacheHints: { 'tools/list': { ttlMs: 300_000, cacheScope: 'public' }, 'server/discover': { ttlMs: 300_000, cacheScope: 'public' } },
    },
  )
  for (const tool of buildConnectorTools({ origin, via, ip, pay: agentPayDeps(origin), ...(Number.isFinite(arrived) && arrived > 0 ? { startedAt: arrived } : {}) })) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema as JsonSchemaType),
        annotations: tool.annotations,
      },
      async (args: unknown) => {
        const started = Date.now()
        let out: Record<string, unknown>
        try {
          out = await tool.execute((args && typeof args === 'object' ? args : {}) as Record<string, unknown>)
        } catch (err) {
          console.error('[mcp] tool threw', tool.name, err instanceof Error ? err.message : err)
          out = { error: 'Something went wrong on our side. Nothing was booked or charged; try again in a moment, or email contact@mapltours.com.' }
        }
        const failed = typeof out.error === 'string'
        console.info('[mcp]', JSON.stringify({ tool: tool.name, via, ok: !failed, ms: Date.now() - started }))
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(out) }],
          ...(failed ? { isError: true } : { structuredContent: out }),
        }
      },
    )
  }
  return server
}

const handler = createMcpHandler(({ requestInfo }) => buildServer(requestInfo), {
  legacy: 'stateless',
  responseMode: 'json',
  maxRequestBodySize: 64 * 1024,
  // No change notifications to deliver, so no subscription streams: each one
  // would hold a serverless invocation open for an anonymous caller.
  maxSubscriptions: 0,
  onerror: (err) => console.warn('[mcp] request error', err.message),
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Robots-Tag', 'noindex')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** Set here, on arrival, for the payment tool's time budget; a caller's own value is replaced. */
const RECEIVED_AT = 'x-mapl-received-at'

export async function POST(incoming: Request): Promise<Response> {
  const headers = new Headers(incoming.headers)
  headers.set(RECEIVED_AT, String(Date.now()))
  const request = new Request(incoming, { headers })
  // Generous: every user of one assistant can arrive from the same addresses.
  if (rateLimit(getIp(request), { windowMs: 60_000, max: 240, bucket: 'mcp' })) {
    return withCors(new Response(JSON.stringify({ error: 'Too many requests. Wait a moment and try again.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }))
  }
  return withCors(await handler.fetch(request))
}

export function OPTIONS(): Response {
  return withCors(new Response(null, { status: 204 }))
}

const notHere = () =>
  withCors(
    new Response('This is the MAPL Tours Jamaica connector for AI assistants (Model Context Protocol, POST only). How to add it: https://mapltours.com/connect\n', {
      status: 405,
      headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  )

export function GET(): Response {
  return notHere()
}

export function DELETE(): Response {
  return notHere()
}
