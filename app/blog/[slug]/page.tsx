import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Footer from '@/components/Footer'
import { getDestination, getTransferPrice, ZONES } from '@/lib/airport-transfers'
import {
  BLOG_POSTS,
  getPostBySlug,
  getRelatedPosts,
  formatPostDate,
  type BlogBlock,
  type BlogPost,
} from '@/lib/blog'

const SITE_URL = 'https://mapltours.com'

function ArticleJsonLd({ post }: { post: BlogPost }) {
  const url = `${SITE_URL}/blog/${post.slug}`
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.excerpt,
    articleSection: post.category,
    wordCount: post.body
      .map((b) => ('text' in b ? b.text : 'items' in b ? b.items.join(' ') : ''))
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length,
    image: [post.image],
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: 'en-US',
    author: {
      '@type': 'Person',
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: {
      '@type': 'Organization',
      name: 'MAPL Tours Jamaica',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.png` },
    },
    about: {
      '@type': 'Place',
      name: 'Jamaica',
      address: { '@type': 'PostalAddress', addressCountry: 'JM' },
    },
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'The MAPL Journal', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
    </>
  )
}

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }))
}

export function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Metadata {
  const post = getPostBySlug(params.slug)
  if (!post) return { title: 'Post not found' }

  const url = `${SITE_URL}/blog/${post.slug}`
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    authors: [{ name: post.author.name }],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url,
      publishedTime: post.publishedAt,
      modifiedTime: post.publishedAt,
      section: post.category,
      authors: [post.author.name],
      images: [{ url: post.image, width: 1600, height: 900, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.image],
    },
  }
}

/* ─── Primitives ─── */

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

function Ornament({ label }: { label?: string }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        margin: '48px auto',
        color: 'var(--gold)',
        fontFamily: 'var(--font-dm-sans)',
        fontSize: label ? 11 : 14,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        maxWidth: 540,
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--border-strong)' }} />
      <span style={{ color: 'var(--gold)' }}>{label ?? '✦'}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-strong)' }} />
    </div>
  )
}

function AuthorMonogram({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--gold)',
        color: 'var(--gold)',
        fontFamily: 'var(--font-dm-sans)',
        fontWeight: 700,
        fontSize: size * 0.38,
        letterSpacing: '0.02em',
        flexShrink: 0,
        background: 'transparent',
      }}
    >
      {initials}
    </span>
  )
}

/* ─── Block renderer ─── */

function Block({ block, isFirst }: { block: BlogBlock; isFirst: boolean }) {
  switch (block.type) {
    case 'h2':
      return (
        <>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 40,
                height: 1,
                background: 'var(--gold)',
                margin: '40px auto 24px',
              }}
            />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 700,
              fontSize: 'var(--fs-h2)',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            {block.text}
          </h2>
        </>
      )
    case 'p':
      if (isFirst) {
        const first = block.text.charAt(0)
        const rest = block.text.slice(1)
        return (
          <p
            className="blog-lead-para"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 19,
              color: 'var(--text-primary)',
              lineHeight: 1.72,
              marginBottom: 28,
            }}
          >
            <span
              style={{
                float: 'left',
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: 700,
                fontSize: 82,
                lineHeight: 0.88,
                color: 'var(--gold)',
                paddingRight: 12,
                paddingTop: 6,
                fontStyle: 'normal',
              }}
            >
              {first}
            </span>
            {rest}
          </p>
        )
      }
      return (
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 400,
            fontSize: 18,
            color: 'var(--text-primary)',
            lineHeight: 1.78,
            marginBottom: 26,
          }}
        >
          {block.text}
        </p>
      )
    case 'quote':
      return (
        <blockquote
          style={{
            margin: '48px auto',
            maxWidth: 580,
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'block',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 64,
              color: 'var(--gold)',
              lineHeight: 0.5,
              marginBottom: 20,
              fontWeight: 700,
            }}
          >
            “
          </span>
          <p
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 'clamp(1.25rem, 2.2vw, 1.6rem)',
              color: 'var(--text-primary)',
              lineHeight: 1.42,
              letterSpacing: '-0.01em',
              marginBottom: 20,
            }}
          >
            {block.text}
          </p>
          {block.attribution && (
            <cite
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12,
                fontStyle: 'normal',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.22em',
              }}
            >
             , {block.attribution}
            </cite>
          )}
        </blockquote>
      )
    case 'image':
      return (
        <figure style={{ margin: '48px -20px' }} className="blog-figure">
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <Image
              src={block.src}
              alt={block.caption ?? ''}
              fill sizes="(max-width:900px) 100vw, 780px"
              style={{ objectFit: 'cover' }}
            />
          </div>
          {block.caption && (
            <figcaption
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                marginTop: 14,
                textAlign: 'center',
                padding: '0 20px',
              }}
            >
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case 'list':
      return (
        <ul
          style={{
            listStyle: 'none',
            margin: '20px 0 32px',
            padding: 0,
          }}
        >
          {block.items.map((item, i) => (
            <li
              key={i}
              style={{
                position: 'relative',
                paddingLeft: 40,
                marginBottom: 18,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 17,
                color: 'var(--text-primary)',
                lineHeight: 1.65,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 24,
                  fontFamily: 'var(--font-dm-sans)',
                  fontWeight: 700,
                  fontStyle: 'italic',
                  color: 'var(--gold)',
                  fontSize: 15,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {item}
            </li>
          ))}
        </ul>
      )
  }
}

/* ─── Related card ─── */

function RelatedCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} style={{ display: 'block' }}>
      <div
        className="photo-card"
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          marginBottom: 16,
          background: 'var(--surface)',
        }}
      >
        <Image
          src={post.image}
          alt={post.title}
          fill sizes="(max-width:900px) 100vw, 360px"
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
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 700,
          fontSize: 19,
          lineHeight: 1.22,
          letterSpacing: '-0.015em',
          color: 'var(--text-primary)',
          marginBottom: 10,
        }}
      >
        {post.title}
      </h3>
      <div
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--text-tertiary)',
        }}
      >
        By {post.author.name}
      </div>
    </Link>
  )
}

/* ─── Page ─── */

export default function BlogPostPage({
  params,
}: {
  params: { slug: string }
}) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  const related = getRelatedPosts(post, 3)

  return (
    <article style={{ minHeight: '100vh', paddingTop: 56, background: 'var(--bg)' }}>
      <ArticleJsonLd post={post} />
      {/* Editorial banner */}
      <header
        style={{
          borderBottom: '1px solid var(--border-strong)',
          paddingTop: 56,
          paddingBottom: 24,
        }}
      >
        <div className="container" style={{ maxWidth: 1120 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 18,
              borderBottom: '1px solid var(--border-strong)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Link
              href="/blog"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.22em',
                color: 'var(--text-primary)',
              }}
            >
              ← The MAPL Journal
            </Link>
            <Kicker size={10}>
              {post.category} · {formatPostDate(post.publishedAt)}
            </Kicker>
          </div>
        </div>
      </header>

      {/* Title block, centered, typographic */}
      <div className="container" style={{ maxWidth: 820, textAlign: 'center', padding: '72px 16px 48px' }}>
        <div style={{ marginBottom: 20 }}>
          <Kicker color="var(--gold)" size={12}>
            A Dispatch · {post.readTime} minute read
          </Kicker>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 700,
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.028em',
            color: 'var(--text-primary)',
            marginBottom: 24,
          }}
        >
          {post.title}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 'clamp(1.1rem, 1.9vw, 1.35rem)',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            maxWidth: 640,
            margin: '0 auto 36px',
          }}
        >
          {post.excerpt}
        </p>

        {/* Byline */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 24px',
            borderTop: '1px solid var(--border-strong)',
            borderBottom: '1px solid var(--border-strong)',
          }}
        >
          <AuthorMonogram initials={post.author.initials} size={40} />
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.22em',
                color: 'var(--text-tertiary)',
                marginBottom: 3,
              }}
            >
              Dispatch by
            </div>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)',
              }}
            >
              {post.author.name}
              <span
                style={{
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: 'var(--text-tertiary)',
                  marginLeft: 8,
                  fontSize: 13,
                }}
              >
                · {post.author.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero image, framed, not full-bleed */}
      <div className="container" style={{ maxWidth: 1000, paddingBottom: 64 }}>
        <div
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            overflow: 'hidden',
            background: 'var(--surface)',
          }}
        >
          <Image
            src={post.image}
            alt={post.title}
            fill sizes="(max-width:900px) 100vw, 1000px"
            priority
            style={{ objectFit: 'cover' }}
          />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--text-tertiary)',
            marginTop: 14,
            textAlign: 'center',
          }}
        >
          {post.title} · Photographed in {post.category.toLowerCase()}.
        </p>
      </div>

      {/* Body */}
      <div
        className="container blog-body"
        style={{
          maxWidth: 680,
          paddingBottom: 80,
        }}
      >
        {post.body.map((block, i) => (
          <Block key={i} block={block} isFirst={i === 0} />
        ))}

        <Ornament label="Fin" />

        {/* Author coda */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 20,
            padding: '28px 0',
            marginTop: 24,
            borderTop: '1px solid var(--border-strong)',
            borderBottom: '1px solid var(--border-strong)',
          }}
        >
          <AuthorMonogram initials={post.author.initials} size={56} />
          <div>
            <Kicker size={10.5}>About the author</Kicker>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontWeight: 700,
                fontSize: 18,
                color: 'var(--text-primary)',
                margin: '8px 0 4px',
              }}
            >
              {post.author.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              {post.author.role} at MAPL Journal. Writes about travel, culture, and the parts
              of Jamaica that don&rsquo;t fit on a postcard.
            </div>
          </div>
        </div>

        {(() => {
          /* Resort reviews get a priced route card: the reader is literally
             researching a hotel we drive to, so show the fare and deep-link
             the route preselected. Slugs not in the map render nothing. */
          const REVIEW_DESTINATIONS: Record<string, string> = {
            'royalton-negril-review': 'royalton-negril',
            'azul-beach-resort-negril-review': 'azul-beach-negril',
            'breathless-montego-bay-review': 'breathless-montego-bay',
            'secrets-wild-orchid-montego-bay-review': 'secrets-wild-orchid',
            'jewel-grande-montego-bay-review': 'jewel-grande-montego-bay',
            'sandals-montego-bay-review': 'sandals-montego-bay',
            'sandals-negril-review': 'sandals-negril',
            'sandals-ochi-review': 'sandals-ochi',
            'moon-palace-jamaica-review': 'moon-palace-ocho-rios',
            'bahia-principe-grand-jamaica-review': 'bahia-principe-runaway-bay',
            'riu-montego-bay-review': 'riu-montego-bay',
            'riu-ocho-rios-review': 'riu-ocho-rios',
            'riu-negril-review': 'riu-negril',
          }
          const destId = REVIEW_DESTINATIONS[post.slug]
          const dest = destId ? getDestination(destId) : undefined
          if (!dest) return null
          const oneWay = getTransferPrice(dest.id, 'one_way')
          const roundTrip = getTransferPrice(dest.id, 'round_trip')
          if (oneWay == null || roundTrip == null) return null
          return (
            <aside
              aria-label={`Airport transfer to ${dest.name}`}
              style={{
                marginTop: 44, borderRadius: 16, border: '1px solid var(--border-strong)',
                background: 'var(--bg-warm)', padding: '24px 26px',
              }}
            >
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>
                Getting there from MBJ
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '10px 0 4px' }}>
                Private transfer to {dest.name}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                {ZONES[dest.zone].duration}. One flat price per vehicle for up to 4
                people: <strong>${oneWay} one-way</strong>, <strong>${roundTrip} round-trip</strong> (10% off two one-ways).
                Meet and greet with a name sign, live flight tracking, free cancellation up to 24 hours before pickup.
              </p>
              <Link
                href={`/transfers?to=${dest.id}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 46, padding: '0 24px', borderRadius: 9999, marginTop: 16,
                  background: 'var(--gold)', color: '#1A1508',
                  fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 700, textDecoration: 'none',
                }}
              >
                Book this transfer →
              </Link>
            </aside>
          )
        })()}

        {/* CTA: every reader planning a Jamaica trip lands at MBJ and needs a
            ride, so the one bridge on all posts points at the product that
            books itself without a login. */}
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
            Landing at MBJ? We drive to every resort in this guide.
          </p>
          <Link
            href="/transfers"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 48,
              padding: '0 28px',
              borderRadius: 9999,
              background: 'var(--gold)',
              color: '#1A1508',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Book a flat-rate airport transfer →
          </Link>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section
          style={{
            background: 'var(--bg-warm)',
            borderTop: '1px solid var(--border-strong)',
            padding: '72px 16px',
          }}
        >
          <div className="container" style={{ maxWidth: 1120 }}>
            <div
              style={{
                textAlign: 'center',
                marginBottom: 48,
              }}
            >
              <Kicker color="var(--gold)" size={12}>Further reading</Kicker>
              <h3
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontWeight: 700,
                  fontSize: 'clamp(1.6rem, 3vw, 2.25rem)',
                  color: 'var(--text-primary)',
                  marginTop: 12,
                  letterSpacing: '-0.02em',
                }}
              >
                <span style={{ fontStyle: 'italic', fontWeight: 500 }}>Continue</span> the edition.
              </h3>
            </div>
            <div
              className="blog-related-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 40,
              }}
            >
              {related.map((p) => (
                <RelatedCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />

      <style>{`
        @media (max-width: 700px) {
          .blog-figure { margin-left: 0 !important; margin-right: 0 !important; }
        }
        @media (max-width: 900px) {
          .blog-related-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 32px !important;
          }
        }
        @media (max-width: 600px) {
          .blog-related-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </article>
  )
}
