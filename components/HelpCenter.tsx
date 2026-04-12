'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Footer from './Footer'
import { DESTINATION_IMAGES } from '@/lib/experiences'

// ── FAQ Data ──
const categories = [
  {
    id: 'booking',
    label: 'Booking',
    icon: '🗓',
    faqs: [
      {
        q: 'How do I book an experience?',
        a: 'Browse experiences on the homepage or Explore page. Tap "Add to Trip" on any experience, then head to checkout. You\'ll select your preferred date, number of guests, and complete payment securely through Stripe.',
      },
      {
        q: 'Can I book for a group?',
        a: 'Absolutely. Most experiences accommodate 1-12 guests — just select your group size at checkout. For groups larger than 12, reach out to us directly and we\'ll arrange a bespoke private experience.',
      },
      {
        q: 'How far in advance should I book?',
        a: 'We recommend booking at least 48 hours in advance to guarantee availability. Popular experiences like the Bob Marley Heritage Pilgrimage and Rick\'s Cafe Cliff Diving can sell out a week ahead during peak season (December-March).',
      },
      {
        q: 'Can I modify my booking after checkout?',
        a: 'Yes. You can change your date or number of guests from your Profile page up to 48 hours before the experience. For other changes, contact our support team and we\'ll sort it out.',
      },
    ],
  },
  {
    id: 'cancellations',
    label: 'Cancellations & Refunds',
    icon: '↩',
    faqs: [
      {
        q: 'Can I cancel my booking?',
        a: 'Yes. Cancel within 48 hours of booking for a full refund — no questions asked. Cancellations made at least 7 days before the experience date receive a 50% refund. Less than 7 days out, bookings are non-refundable.',
      },
      {
        q: 'What if the creator cancels my experience?',
        a: 'If a creator cancels, you receive a full refund automatically, or you can choose to rebook at no additional cost. We\'ll notify you immediately and help arrange an alternative experience if you prefer.',
      },
      {
        q: 'How long do refunds take to process?',
        a: 'Refunds are initiated within 24 hours and typically appear in your account within 5-10 business days, depending on your bank or card issuer.',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Your Experience',
    icon: '🌴',
    faqs: [
      {
        q: 'What should I bring?',
        a: 'Each experience has specific recommendations in its description. Generally: comfortable shoes, sunscreen, a water bottle, and a sense of adventure. Your creator will send detailed prep instructions 24 hours before your experience.',
      },
      {
        q: 'Is transportation included?',
        a: 'Some experiences include hotel pickup — check the experience details for specifics. When transportation isn\'t included, your creator will provide clear meeting point instructions with GPS coordinates and directions.',
      },
      {
        q: 'What happens if it rains?',
        a: 'Jamaica gets brief tropical showers — most experiences run rain or shine (it\'s part of the adventure). If severe weather forces a cancellation, we\'ll reschedule at no cost or issue a full refund.',
      },
      {
        q: 'Are experiences suitable for children?',
        a: 'Many are family-friendly — look for the age recommendations in each experience\'s details. Adventures like cliff diving have minimum age requirements. When in doubt, message the creator through the experience page.',
      },
    ],
  },
  {
    id: 'payments',
    label: 'Payments & Pricing',
    icon: '💳',
    faqs: [
      {
        q: 'What currencies and payment methods do you accept?',
        a: 'We accept all major credit and debit cards, Apple Pay, and Google Pay. Prices are listed in USD, but you can view converted amounts in your local currency using the language switcher in the header.',
      },
      {
        q: 'Are there any hidden fees?',
        a: 'No hidden fees. The price you see includes the experience cost and a transparent service fee that covers platform costs, creator support, and your booking guarantee. Everything is itemized at checkout.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Completely. All payments are processed through Stripe, a PCI Level 1 certified payment processor — the highest security standard in the industry. We never store your card details.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Your Account',
    icon: '👤',
    faqs: [
      {
        q: 'How do I create an account?',
        a: 'Sign up with Google, Apple, or your email address. It takes under 30 seconds. You\'ll need an account to complete bookings and access your trip history.',
      },
      {
        q: 'Can I update my personal information?',
        a: 'Yes. Head to your Profile page where you can edit your name, email, phone number, government ID, and location. Changes save instantly.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Contact support@mapltours.com with your request. We\'ll process it within 48 hours and delete all your personal data in accordance with our privacy policy.',
      },
    ],
  },
]

// ── Accordion Item ──
function AccordionItem({ q, a, open, onToggle }: {
  q: string; a: string; open: boolean; onToggle: () => void
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '22px 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.4,
        }}>
          {q}
        </span>
        <span style={{
          fontSize: 20, color: 'var(--text-tertiary)',
          flexShrink: 0, lineHeight: 1,
          transition: 'transform 0.25s ease',
          transform: open ? 'rotate(45deg)' : 'none',
        }}>
          +
        </span>
      </button>
      <div style={{
        maxHeight: open ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease, opacity 0.25s ease',
        opacity: open ? 1 : 0,
      }}>
        <p style={{
          fontSize: 15, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-dm-sans)', lineHeight: 1.7,
          paddingBottom: 22,
        }}>
          {a}
        </p>
      </div>
    </div>
  )
}

export default function HelpCenter() {
  const [activeCategory, setActiveCategory] = useState('booking')
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [search, setSearch] = useState('')

  const activeCat = categories.find((c) => c.id === activeCategory)!

  // Search across all categories
  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return categories.flatMap((cat) =>
      cat.faqs
        .filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
        .map((f) => ({ ...f, category: cat.label }))
    )
  }, [search])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 56 }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        height: 340,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Image
          src={DESTINATION_IMAGES['Ocho Rios']}
          alt="Help Center"
          fill sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
          priority
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 100%)',
        }} />

        <div style={{
          position: 'relative', zIndex: 1, textAlign: 'center',
          maxWidth: 620, padding: '0 24px',
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.14em', color: 'var(--gold-warm)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 12,
          }}>
            Support
          </p>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 800,
            fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'white',
            lineHeight: 1.1, letterSpacing: '-0.03em',
            marginBottom: 20,
          }}>
            How can we help?
          </h1>

          {/* Search */}
          <div style={{
            position: 'relative', maxWidth: 480, margin: '0 auto',
          }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for answers..."
              style={{
                width: '100%', height: 52,
                borderRadius: 9999,
                border: 'none',
                padding: '0 24px 0 50px',
                fontSize: 15, fontFamily: 'var(--font-dm-sans)',
                color: 'var(--text-primary)',
                background: 'rgba(255,255,255,0.97)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-tertiary)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', paddingBottom: 80 }}>

        {/* Search results */}
        {searchResults ? (
          <div style={{ paddingTop: 40 }}>
            <p style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 20,
            }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
            </p>
            {searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>🔍</p>
                <p style={{
                  fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-syne)', marginBottom: 6,
                }}>
                  No results found
                </p>
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                }}>
                  Try different keywords or browse the categories below
                </p>
              </div>
            ) : (
              searchResults.map((r, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ padding: '20px 0' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--gold)',
                      fontFamily: 'var(--font-dm-sans)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {r.category}
                    </span>
                    <p style={{
                      fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
                      fontFamily: 'var(--font-dm-sans)', marginTop: 4, marginBottom: 6,
                    }}>
                      {r.q}
                    </p>
                    <p style={{
                      fontSize: 14, color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                    }}>
                      {r.a}
                    </p>
                  </div>
                </div>
              ))
            )}
            <button
              onClick={() => setSearch('')}
              style={{
                marginTop: 24, background: 'none', border: 'none',
                fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                fontFamily: 'var(--font-dm-sans)', textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Browse all categories
            </button>
          </div>
        ) : (
          <>
            {/* Category tabs */}
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto',
              paddingTop: 36, paddingBottom: 8,
              scrollbarWidth: 'none',
            }}>
              {categories.map((cat) => {
                const active = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setOpenIndex(0) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 20px',
                      borderRadius: 9999,
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'var(--accent)' : 'var(--card-bg)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      fontSize: 13.5, fontWeight: 600,
                      fontFamily: 'var(--font-dm-sans)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      boxShadow: active ? 'none' : 'var(--shadow-xs)',
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{cat.icon}</span>
                    {cat.label}
                  </button>
                )
              })}
            </div>

            {/* FAQ accordion */}
            <div style={{ paddingTop: 16 }}>
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {activeCat.faqs.map((faq, i) => (
                  <AccordionItem
                    key={faq.q}
                    q={faq.q}
                    a={faq.a}
                    open={openIndex === i}
                    onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                  />
                ))}
              </div>
            </div>

            {/* ── Contact Section ── */}
            <div style={{ marginTop: 64 }}>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <h2 style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 800,
                  fontSize: 24, color: 'var(--text-primary)',
                  letterSpacing: '-0.02em', marginBottom: 8,
                }}>
                  Still need help?
                </h2>
                <p style={{
                  fontSize: 15, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                }}>
                  Our Jamaica-based support team is available 24/7.
                </p>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
              }}>
                {/* Email */}
                <a href="mailto:support@mapltours.com" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center', padding: '36px 24px',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  boxShadow: 'var(--shadow-sm)',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                    (e.currentTarget as HTMLElement).style.transform = ''
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, marginBottom: 16,
                  }}>
                    ✉
                  </div>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: 8,
                  }}>
                    Email us
                  </p>
                  <p style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}>
                    support@mapltours.com
                  </p>
                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', marginTop: 6,
                  }}>
                    Response within 2 hours
                  </p>
                </a>

                {/* Phone */}
                <a href="tel:+18765550123" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center', padding: '36px 24px',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  boxShadow: 'var(--shadow-sm)',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                    (e.currentTarget as HTMLElement).style.transform = ''
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, marginBottom: 16,
                  }}>
                    📞
                  </div>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: 8,
                  }}>
                    Call us
                  </p>
                  <p style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}>
                    +1 (876) 555-0123
                  </p>
                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', marginTop: 6,
                  }}>
                    Available 24/7
                  </p>
                </a>

                {/* WhatsApp */}
                <a href="https://wa.me/18765550123" target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center', padding: '36px 24px',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  boxShadow: 'var(--shadow-sm)',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                    (e.currentTarget as HTMLElement).style.transform = ''
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, marginBottom: 16,
                  }}>
                    💬
                  </div>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: 8,
                  }}>
                    WhatsApp
                  </p>
                  <p style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}>
                    Message us
                  </p>
                  <p style={{
                    fontSize: 12, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', marginTop: 6,
                  }}>
                    Fastest response
                  </p>
                </a>
              </div>
            </div>

            {/* ── Quick links ── */}
            <div style={{
              marginTop: 56, padding: '36px 40px',
              borderRadius: 'var(--r-xl)',
              background: 'var(--bg-warm)',
              border: '1px solid var(--border)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-syne)', fontWeight: 700,
                fontSize: 18, color: 'var(--text-primary)',
                marginBottom: 20,
              }}>
                Quick links
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 40px' }}>
                {[
                  { label: 'Explore experiences', href: '/explore' },
                  { label: 'Your profile', href: '/profile' },
                  { label: 'About MAPL Tours', href: '/about' },
                  { label: 'Safety guidelines', href: '/safety' },
                  { label: 'Accessibility', href: '/accessibility' },
                  { label: 'Terms of service', href: '/terms' },
                ].map((link) => (
                  <Link key={link.href} href={link.href} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                    transition: 'color 0.15s ease',
                  }}>
                    {link.label}
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 16 }}>›</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
