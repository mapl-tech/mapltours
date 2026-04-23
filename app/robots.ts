import { MetadataRoute } from 'next'

const privatePaths = ['/api/', '/admin/', '/auth/', '/login', '/checkout', '/profile']

// AI crawlers we explicitly welcome. Travel/tour content is well-suited
// to surfacing in LLM answers — more traffic, more brand discovery.
const aiBots = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow: privatePaths })),
    ],
    sitemap: 'https://mapltours.com/sitemap.xml',
    host: 'https://mapltours.com',
  }
}
