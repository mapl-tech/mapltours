import { MetadataRoute } from 'next'

const privatePaths = [
  '/api/', '/admin/', '/auth/', '/login', '/checkout', '/transfers/checkout', '/transfers/confirm', '/profile', '/driver',
]

// AI crawlers we explicitly welcome. Travel/tour content is well-suited
// to surfacing in LLM answers, more traffic, more brand discovery.
const aiBots = [
  'GPTBot',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'cohere-ai',
  'Bytespider',
  'Amazonbot',
  'YouBot',
  'DuckAssistBot',
  'Meta-ExternalAgent',
]

/**
 * Fetchers that load a page because a person asked their assistant to, one
 * page at a time, not crawlers building an index. A guest who tells one to
 * "book the ride" or open a checkout link is sent to the two checkout pages,
 * and a robots rule that forbids them there stops the booking for no gain:
 * both pages are marked noindex, and they hold no private data on the
 * server (the cart lives in the guest's own browser, and a bare fetch sees
 * only a loading card). The confirmation pages stay closed: they read a
 * booking by the id in their address. Browser-driven agents (a real browser
 * acting for the guest) never read robots.txt at all; this is for the ones
 * that do.
 */
const userAgents = ['ChatGPT-User', 'Perplexity-User', 'Claude-User', 'Meta-ExternalFetcher']
const userAgentPrivate = [
  ...privatePaths.filter((p) => p !== '/checkout' && p !== '/transfers/checkout'),
  '/checkout/confirm',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow: privatePaths })),
      ...userAgents.map((userAgent) => ({ userAgent, allow: ['/', '/checkout', '/transfers/checkout'], disallow: userAgentPrivate })),
    ],
    sitemap: 'https://mapltours.com/sitemap.xml',
    host: 'https://mapltours.com',
  }
}
