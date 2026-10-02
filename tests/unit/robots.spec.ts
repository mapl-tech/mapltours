import { describe, test, expect } from 'vitest'
import robots from '../../app/robots'

/**
 * A small robots.txt matcher: the group for the most specific user agent,
 * then the longest matching rule, allow winning a tie (RFC 9309).
 */
function allowed(userAgent: string, path: string): boolean {
  const rules = robots().rules
  const groups = Array.isArray(rules) ? rules : [rules]
  const ua = userAgent.toLowerCase()
  const agents = (g: (typeof groups)[number]) => (Array.isArray(g.userAgent) ? g.userAgent : [g.userAgent ?? '*']).map((a) => a.toLowerCase())
  const group = groups.find((g) => agents(g).includes(ua)) ?? groups.find((g) => agents(g).includes('*'))!
  const list = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])
  let best = { len: -1, allow: true }
  for (const [paths, allow] of [[list(group.allow), true], [list(group.disallow), false]] as const) {
    for (const p of paths) {
      if (!path.startsWith(p)) continue
      if (p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow }
    }
  }
  return best.allow
}

describe('robots.txt', () => {
  test('crawlers stay out of checkout, confirmation and private pages', () => {
    for (const bot of ['Googlebot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Meta-ExternalAgent']) {
      for (const p of ['/checkout', '/checkout/confirm?booking_id=x', '/transfers/checkout', '/transfers/confirm', '/admin/', '/api/checkout', '/profile', '/driver']) {
        expect(allowed(bot, p), `${bot} ${p}`).toBe(false)
      }
      expect(allowed(bot, '/transfers'), bot).toBe(true)
      expect(allowed(bot, '/explore'), bot).toBe(true)
      expect(allowed(bot, '/transfers/sandals-negril'), bot).toBe(true)
    }
  })

  test('a fetcher acting for a person may open both checkouts, and nothing more private', () => {
    for (const agent of ['ChatGPT-User', 'Perplexity-User', 'Claude-User', 'Meta-ExternalFetcher']) {
      expect(allowed(agent, '/checkout'), agent).toBe(true)
      expect(allowed(agent, '/transfers/checkout'), agent).toBe(true)
      expect(allowed(agent, '/transfers'), agent).toBe(true)
      for (const p of ['/checkout/confirm?booking_id=x', '/transfers/confirm?booking_id=x', '/admin/', '/api/transfers/checkout', '/profile', '/driver', '/login']) {
        expect(allowed(agent, p), `${agent} ${p}`).toBe(false)
      }
    }
  })
})
