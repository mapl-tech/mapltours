'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BLOG_CATEGORIES, type BlogPost, formatPostDate } from '@/lib/blog'
import Footer from './Footer'

/* ─── Small primitives ─── */

function Rule({ weight = 1, color = 'var(--text-primary)' }: { weight?: number; color?: string }) {
  return <div style={{ height: weight, background: color, width: '100%' }} />
}

function Ornament() {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: 'var(--gold)',
        fontFamily: 'var(--font-syne)',
        fontSize: 14,
        letterSpacing: '0.2em',
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--border-strong)', maxWidth: 120 }} />
      <span>✦</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-strong)', maxWidth: 120 }} />
    </div>
  )
}

function Kicker({
  children,
  color = 'var(--text-tertiary)',
  size = 10.5,
}: {
  children: React.ReactNode
  color?: string
  size?: number
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 600,
        fontSize: size,
        textTransform: 'uppercase',
        letterSpacing: '0.22em',
        color,
      }}
    >
      {children}
    </span>
  )
}

function romanize(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  let rem = n
  for (const [v, r] of map) {
    while (rem >= v) {
      out += r
      rem -= v
    }
  }
  return out
}

/* ─── Masthead (nameplate) ─── */

function Masthead() {
  const now = new Date()
  const dateline = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const vol = romanize(now.getFullYear() - 2023)
  const issue = romanize(now.getMonth() + 1)

  return (
    <header
      style={{
        paddingTop: 72,
        paddingBottom: 40,
        background: 'var(--bg)',
      }}
    >
      <div className="container" style={{ maxWidth: 1120 }}>
        {/* Top dateline strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 28,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Kicker size={10}>Vol. {vol} · No. {issue}</Kicker>
          <Kicker size={10}>{dateline}</Kicker>
          <Kicker size={10}>Kingston · Negril · Portland</Kicker>
        </div>

        <Rule weight={2} />

        {/* Nameplate */}
        <div style={{ textAlign: 'center', padding: '32px 8px 24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(2.75rem, 7vw, 5rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: 'var(--text-primary)',
              marginBottom: 12,
            }}
          >
            <span style={{ fontStyle: 'italic', fontWeight: 500 }}>The</span>{' '}
            MAPL{' '}
            <span style={{ fontStyle: 'italic', fontWeight: 500 }}>Journal</span>
          </div>
          <Kicker color="var(--gold)" size={11}>
            Dispatches from the real Jamaica · Established MMXXIV
          </Kicker>
        </div>

        <Rule weight={1} color="var(--border-strong)" />

        {/* Mission line */}
        <p
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 'clamp(1.05rem, 1.6vw, 1.3rem)',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            maxWidth: 620,
            margin: '24px auto 0',
          }}
        >
          Essays, guides, and dispatches from the pit masters, selectors, and guides
          who know the island — because they live here.
        </p>
      </div>
    </header>
  )
}

/* ─── Category nav (editorial, not pills) ─── */

function CategoryNav({
  active,
  onSelect,
}: {
  active: (typeof BLOG_CATEGORIES)[number]
  onSelect: (c: (typeof BLOG_CATEGORIES)[number]) => void
}) {
  return (
    <nav
      className="container"
      style={{
        maxWidth: 1120,
        background: 'var(--bg)',
        paddingTop: 18,
        paddingBottom: 18,
        borderTop: '1px solid var(--border-strong)',
        borderBottom: '1px solid var(--border-strong)',
      }}
    >
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 36,
          overflowX: 'auto',
        }}
      >
        {BLOG_CATEGORIES.map((cat) => {
          const isActive = cat === active
          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 0',
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 11.5,
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                paddingBottom: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ─── Featured (lead) ─── */

function FeaturedLead({ post }: { post: BlogPost }) {
  return (
    <article
      className="blog-featured"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)',
        gap: 56,
        alignItems: 'center',
      }}
    >
      {/* Image */}
      <Link
        href={`/blog/${post.slug}`}
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          display: 'block',
          background: 'var(--surface)',
        }}
        className="photo-card"
      >
        <Image
          src={post.image}
          alt={post.title}
          fill sizes="(max-width:900px) 100vw, 720px"
          priority
          style={{ objectFit: 'cover' }}
        />
      </Link>

      {/* Copy */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <Kicker color="var(--gold)" size={11}>
            The Lead · {post.category}
          </Kicker>
        </div>
        <Link href={`/blog/${post.slug}`}>
          <h2
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 'clamp(1.85rem, 3.6vw, 3rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginBottom: 22,
            }}
          >
            {post.title}
          </h2>
        </Link>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 17,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            marginBottom: 28,
            maxWidth: 520,
          }}
        >
          {post.excerpt}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            paddingTop: 20,
            borderTop: '1px solid var(--border-strong)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 10.5,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--text-tertiary)',
                marginBottom: 4,
              }}
            >
              By {post.author.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12.5,
                color: 'var(--text-tertiary)',
              }}
            >
              {formatPostDate(post.publishedAt)} · {post.readTime} min read
            </div>
          </div>
          <Link
            href={`/blog/${post.slug}`}
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--text-primary)',
              borderBottom: '1px solid var(--text-primary)',
              paddingBottom: 2,
            }}
          >
            Read the essay →
          </Link>
        </div>
      </div>
    </article>
  )
}

/* ─── Post card (editorial) ─── */

function PostCard({ post, size = 'md' }: { post: BlogPost; size?: 'md' | 'lg' }) {
  const isLg = size === 'lg'
  return (
    <article>
      <Link href={`/blog/${post.slug}`} style={{ display: 'block' }}>
        <div
          className="photo-card"
          style={{
            position: 'relative',
            aspectRatio: isLg ? '4 / 5' : '4 / 3',
            overflow: 'hidden',
            marginBottom: 18,
            background: 'var(--surface)',
          }}
        >
          <Image
            src={post.image}
            alt={post.title}
            fill
            sizes={isLg ? '(max-width:900px) 100vw, 520px' : '(max-width:900px) 100vw, 360px'}
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <Kicker color="var(--gold)" size={10.5}>
            {post.category}
          </Kicker>
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: isLg ? 'clamp(1.45rem, 2vw, 1.85rem)' : 20,
            lineHeight: 1.18,
            letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
            marginBottom: 12,
          }}
        >
          {post.title}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: isLg ? 16 : 14.5,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            marginBottom: 18,
            display: '-webkit-box',
            WebkitLineClamp: isLg ? 4 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {post.excerpt}
        </p>
        <div
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 10.5,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--text-tertiary)',
          }}
        >
          By {post.author.name} · {post.readTime} min
        </div>
      </Link>
    </article>
  )
}

/* ─── Newsletter (editorial colophon) ─── */

function Colophon() {
  return (
    <section
      style={{
        background: 'var(--bg-warm)',
        borderTop: '1px solid var(--border-strong)',
        borderBottom: '1px solid var(--border-strong)',
        padding: '96px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <Ornament />
        </div>
        <Kicker color="var(--gold)" size={11}>
          By invitation
        </Kicker>
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 'clamp(1.65rem, 3.2vw, 2.4rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            margin: '14px auto 16px',
            color: 'var(--text-primary)',
          }}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 500 }}>Subscribe to</span> the dispatch.
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-syne)',
            fontStyle: 'italic',
            fontSize: 16.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            marginBottom: 32,
          }}
        >
          One letter each month. New essays, insider guides, and early access to experiences
          before they reach the site.
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid var(--text-primary)',
            maxWidth: 420,
            margin: '0 auto',
          }}
        >
          <input
            type="email"
            placeholder="your.email@domain.com"
            aria-label="Email address"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '12px 4px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-syne)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '12px 4px',
              cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
              color: 'var(--text-primary)',
            }}
          >
            Subscribe →
          </button>
        </form>
      </div>
    </section>
  )
}

/* ─── Main ─── */

export default function BlogIndex({ posts }: { posts: BlogPost[] }) {
  const [active, setActive] = useState<(typeof BLOG_CATEGORIES)[number]>('All')

  const lead = useMemo(() => posts.find((p) => p.featured) ?? posts[0], [posts])
  const rest = useMemo(() => posts.filter((p) => p.slug !== lead.slug), [posts, lead])

  const filtered = useMemo(() => {
    if (active === 'All') return rest
    return rest.filter((p) => p.category === active)
  }, [rest, active])

  const [spread1, spread2, ...tail] = filtered

  return (
    <div style={{ minHeight: '100vh', paddingTop: 56, background: 'var(--bg)' }}>
      <Masthead />

      <CategoryNav active={active} onSelect={setActive} />

      {/* Lead */}
      {active === 'All' && (
        <section
          className="container"
          style={{ maxWidth: 1120, paddingTop: 80, paddingBottom: 80 }}
        >
          <FeaturedLead post={lead} />
        </section>
      )}

      {/* Divider ornament */}
      {active === 'All' && (
        <div style={{ padding: '16px 0 40px' }}>
          <Ornament />
        </div>
      )}

      {/* Main content */}
      <section
        className="container"
        style={{ maxWidth: 1120, paddingTop: active === 'All' ? 0 : 56, paddingBottom: 88 }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 20px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-syne)',
              fontStyle: 'italic',
              fontSize: 18,
            }}
          >
            No dispatches in this category yet. Please return shortly.
          </div>
        ) : (
          <>
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 20,
                marginBottom: 48,
                paddingBottom: 20,
                borderBottom: '2px solid var(--text-primary)',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                  fontSize: 'clamp(1.4rem, 2.4vw, 1.85rem)',
                  letterSpacing: '-0.01em',
                  color: 'var(--text-primary)',
                }}
              >
                {active === 'All' ? 'The Edition' : active}
              </h3>
              <Kicker size={10.5}>
                {filtered.length} {filtered.length === 1 ? 'dispatch' : 'dispatches'}
              </Kicker>
            </div>

            {/* Two-up spread */}
            {(spread1 || spread2) && (
              <div
                className="blog-spread"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 56,
                  marginBottom: tail.length > 0 ? 72 : 0,
                  paddingBottom: tail.length > 0 ? 56 : 0,
                  borderBottom: tail.length > 0 ? '1px solid var(--border-strong)' : 'none',
                }}
              >
                {spread1 && <PostCard post={spread1} size="lg" />}
                {spread2 && <PostCard post={spread2} size="lg" />}
              </div>
            )}

            {/* Tail grid */}
            {tail.length > 0 && (
              <div
                className="blog-tail"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 48,
                }}
              >
                {tail.map((p) => (
                  <PostCard key={p.slug} post={p} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <Colophon />
      <Footer />

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.blog-featured) {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 32px !important;
          }
          :global(.blog-spread) {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 48px !important;
          }
          :global(.blog-tail) {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 36px !important;
          }
        }
        @media (max-width: 600px) {
          :global(.blog-tail) {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}
