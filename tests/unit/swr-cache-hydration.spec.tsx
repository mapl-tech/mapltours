import { describe, it, expect, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { useSwrCache } from '@/lib/swr-cache'

/**
 * useSwrCache must render, while React uses server snapshots (the server
 * render and the hydration render), exactly what the server sends, however
 * much the visitor's localStorage cache holds.
 *
 * On Oct 6 2026 the Blue Hole tour broke on every repeat visit: its one
 * cached comment rendered on the client's first pass where the server had
 * sent "No comments yet", and React discarded the page's server HTML
 * (#418, #423, #425). Lighthouse marked best practices down to 96 and the
 * redraw cost up to 20 points of performance.
 *
 * renderToString uses the same server snapshot that hydration does, so a
 * stubbed `window` here stands in for a returning visitor's browser.
 */

const KEY = 'comments:18'

function Comments() {
  const { data, loading } = useSwrCache<string[]>(KEY, async () => ['fresh'])
  if (loading) return <p>Loading comments</p>
  return <p>{data?.length ? data.join(' | ') : 'No comments yet. Be the first below.'}</p>
}

const g = globalThis as { window?: unknown }
const original = g.window

function returningVisitor() {
  const stored = new Map([[`mapl:cache:v1:${KEY}`, JSON.stringify({ data: ['Leshan: test'], ts: Date.now() })]])
  g.window = {
    localStorage: {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
      key: () => null,
      length: stored.size,
    },
  }
}

afterEach(() => {
  g.window = original
})

describe('useSwrCache while hydrating', () => {
  it('renders the same markup for a returning visitor as the server does', () => {
    const server = renderToString(<Comments />)
    returningVisitor()
    expect(renderToString(<Comments />)).toBe(server)
  })

  it('does not show the cached data in that render', () => {
    returningVisitor()
    expect(renderToString(<Comments />)).not.toContain('Leshan: test')
  })
})
