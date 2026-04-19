import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { DESTINATION_IMAGES } from '@/lib/experiences'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'About MAPL Tours — Jamaica, Told by Its People',
  description: 'The story behind MAPL Tours Jamaica: a cultural travel platform connecting travelers with authentic experiences crafted by local creators.',
}

const VALUES = [
  {
    title: 'Authenticity, without compromise',
    body: 'Every experience on MAPL is created and led by a Jamaican. We reject the majority of submissions so only the most honest, most considered work reaches our travelers.',
  },
  {
    title: 'Tourism that uplifts',
    body: 'The money you spend here flows back to the creators, the parishes, the families. We measure ourselves by what our communities gain — not by what we extract.',
  },
  {
    title: 'Cultural stewardship',
    body: 'We work alongside elders, chefs, musicians, farmers, and fishermen to make sure the Jamaica we share is the Jamaica they recognise.',
  },
  {
    title: 'A standard we stand behind',
    body: 'Every experience is personally vetted. Every booking is supported around the clock. Every cancellation, within 48 hours, is free. No problem.',
  },
]

const STATS = [
  { value: '19', label: 'Curated experiences' },
  { value: '4.9', label: 'Average rating' },
  { value: '8', label: 'Parishes covered' },
]

const GOLD = '#A68B3C'
const GOLD_WARM = '#C4A44A'
const INK = '#171614'
const INK_WARM = '#1A1917'

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 56, background: 'var(--bg)', color: INK }}>
      {/* ═══════════════════════════════════
         HERO — cinematic full-bleed
         ═══════════════════════════════════ */}
      <section style={{
        position: 'relative',
        height: 'min(78vh, 760px)',
        minHeight: 520,
        width: '100%',
        overflow: 'hidden',
        background: INK,
      }}>
        <Image
          src={DESTINATION_IMAGES['Blue Mountains']}
          alt="Jamaica, from above"
          fill priority sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 55%' }}
        />
        {/* Ink wash — readable without washing out the image */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(23,22,20,0.35) 0%, rgba(23,22,20,0.18) 42%, rgba(23,22,20,0.78) 100%)',
        }} />
        {/* Fine hairline at top — editorial chrome */}
        <div style={{
          position: 'absolute', top: 28,
          left: '6vw', right: '6vw',
          height: 1, background: 'rgba(255,255,255,0.22)',
        }} />

        {/* Kicker + masthead marque */}
        <div style={{
          position: 'absolute',
          top: 48,
          left: '6vw', right: '6vw',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'rgba(255,255,255,0.86)',
        }}>
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 11,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: GOLD_WARM,
          }}>
            Our Story
          </span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
            fontWeight: 500, textTransform: 'uppercase',
            letterSpacing: '0.26em', color: 'rgba(255,255,255,0.55)',
          }}>
            Est. MMXXVI · Kingston, Jamaica
          </span>
        </div>

        {/* Title block — anchored bottom-left, editorial hang */}
        <div style={{
          position: 'absolute',
          bottom: 'clamp(40px, 7vh, 88px)',
          left: '6vw', right: '6vw',
          maxWidth: 1040,
        }}>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 700,
            fontSize: 'clamp(2.75rem, 8.2vw, 6.75rem)',
            lineHeight: 0.96,
            letterSpacing: '-0.035em',
            color: '#fff',
            textWrap: 'balance',
          }}>
            Jamaica,<br />
            <span style={{ fontStyle: 'italic', fontWeight: 700, color: GOLD_WARM }}>told by</span> its people.
          </h1>
          <p style={{
            marginTop: 'clamp(18px, 2.5vh, 28px)',
            maxWidth: 580,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 'clamp(14.5px, 1.6vw, 17px)',
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.82)',
            fontWeight: 400,
          }}>
            A cultural travel platform built for the Jamaica beyond the resort — one story, one parish, one local creator at a time.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════
         MANIFESTO — oversized pull quote
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1100, margin: '0 auto',
        padding: 'clamp(72px, 10vh, 140px) 6vw clamp(48px, 6vh, 80px)',
      }}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
          fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.24em', color: GOLD,
          marginBottom: 28,
        }}>
          <span style={{ display: 'inline-block', width: 32, height: 1, background: GOLD, verticalAlign: 'middle', marginRight: 14 }} />
          Manifesto
        </p>
        <p style={{
          fontFamily: 'var(--font-syne)', fontWeight: 700,
          fontSize: 'clamp(1.75rem, 3.8vw, 3.1rem)',
          lineHeight: 1.12,
          letterSpacing: '-0.022em',
          color: INK,
          textWrap: 'balance',
          maxWidth: 940,
        }}>
          We didn&rsquo;t build MAPL Tours to sell Jamaica. We built it so Jamaica could
          {' '}
          <span style={{ fontStyle: 'italic', color: GOLD }}>tell its own story</span>
          {' '}
          — in its own voice, on its own terms, to travelers who actually want to listen.
        </p>
      </section>

      {/* ═══════════════════════════════════
         TWO-COLUMN: IMAGE + LONG-FORM
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1260, margin: '0 auto',
        padding: '0 6vw clamp(72px, 10vh, 140px)',
      }}>
        <div className="about-split">
          <div className="about-split-img">
            <Image
              src={DESTINATION_IMAGES['Portland']}
              alt="Portland, Jamaica"
              fill sizes="(max-width: 768px) 100vw, 45vw"
              style={{ objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', left: 20, bottom: 20,
              padding: '7px 12px', borderRadius: 9999,
              background: 'rgba(23,22,20,0.72)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: 'rgba(255,255,255,0.92)',
              fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
              fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              Rio Grande · Portland
            </div>
          </div>

          <div className="about-split-copy">
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
              fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.24em', color: GOLD, marginBottom: 18,
            }}>
              Who We Are
            </p>
            <h2 style={{
              fontFamily: 'var(--font-syne)', fontWeight: 700,
              fontSize: 'clamp(1.5rem, 2.6vw, 2.25rem)',
              lineHeight: 1.12, letterSpacing: '-0.018em',
              color: INK, marginBottom: 24, textWrap: 'balance',
            }}>
              A product of MAPL Tech, with a single, stubborn idea.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 20 }}>
              The best way to experience Jamaica has never been through a lobby key card. It&rsquo;s through Devon&rsquo;s jerk pit in Boston Bay, a sound system in Trench Town, the first cup of coffee poured at 5,000 feet as the Blue Mountains are still waking up.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 20 }}>
              MAPL Tours is a cultural travel platform that connects travelers with the people who make Jamaica, Jamaica — creators, chefs, fishermen, musicians, farmers, historians — and pays them properly for the privilege.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}>
              We are proudly built by <Link href="https://www.mapltech.com" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationThickness: '1px' }}>MAPL Tech</Link> — a technology company dedicated to products that connect people with authentic cultural experiences around the world.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
         VALUES — numbered editorial list (no cards)
         ═══════════════════════════════════ */}
      <section style={{ background: '#FAF9F7' }}>
        <div style={{
          maxWidth: 1260, margin: '0 auto',
          padding: 'clamp(72px, 10vh, 140px) 6vw',
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', flexWrap: 'wrap',
            gap: 24, marginBottom: 56,
          }}>
            <div>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
                fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.24em', color: GOLD, marginBottom: 14,
              }}>
                Our Values
              </p>
              <h2 style={{
                fontFamily: 'var(--font-syne)', fontWeight: 700,
                fontSize: 'clamp(1.8rem, 3.2vw, 2.75rem)',
                lineHeight: 1.08, letterSpacing: '-0.02em',
                color: INK, textWrap: 'balance', maxWidth: 720,
              }}>
                Four principles, held to uncompromisingly.
              </h2>
            </div>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 11,
              fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
            }}>
              I — IV
            </p>
          </div>

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: '1px solid rgba(23,22,20,0.12)' }}>
            {VALUES.map((v, i) => (
              <li key={v.title} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(56px, 92px) 1fr',
                gap: 'clamp(16px, 3vw, 48px)',
                padding: 'clamp(28px, 4.5vh, 48px) 0',
                borderBottom: '1px solid rgba(23,22,20,0.12)',
                alignItems: 'baseline',
              }}>
                <span style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 700,
                  fontSize: 'clamp(1.1rem, 1.5vw, 1.35rem)',
                  letterSpacing: '0.08em',
                  color: GOLD,
                }}>
                  {toRoman(i + 1)}.
                </span>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', maxWidth: 880 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 700,
                    fontSize: 'clamp(1.2rem, 2vw, 1.6rem)',
                    lineHeight: 1.2, letterSpacing: '-0.014em',
                    color: INK, textWrap: 'balance',
                  }}>
                    {v.title}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: 'clamp(14.5px, 1.2vw, 16px)',
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                  }}>
                    {v.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══════════════════════════════════
         BY THE NUMBERS — hairline-ruled row
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1260, margin: '0 auto',
        padding: 'clamp(72px, 10vh, 140px) 6vw',
      }}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
          fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.24em', color: GOLD, marginBottom: 14,
          textAlign: 'center',
        }}>
          By the Numbers
        </p>
        <h2 style={{
          fontFamily: 'var(--font-syne)', fontWeight: 700,
          fontSize: 'clamp(1.5rem, 2.4vw, 2rem)',
          lineHeight: 1.12, letterSpacing: '-0.015em',
          color: INK, marginBottom: 'clamp(40px, 6vh, 72px)',
          textAlign: 'center', textWrap: 'balance',
        }}>
          Small by design. Deep by intention.
        </h2>
        <div className="about-stats">
          {STATS.map((s) => (
            <div key={s.label} style={{
              flex: 1, padding: 'clamp(24px, 4vh, 40px) 8px',
              textAlign: 'center', position: 'relative',
            }}>
              <p style={{
                fontFamily: 'var(--font-syne)', fontWeight: 700,
                fontSize: 'clamp(3rem, 7vw, 5.5rem)',
                lineHeight: 1,
                letterSpacing: '-0.04em',
                color: INK, marginBottom: 14,
              }}>
                {s.value}
              </p>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 11.5,
                fontWeight: 500, textTransform: 'uppercase',
                letterSpacing: '0.22em', color: 'var(--text-tertiary)',
              }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════
         SIGNED CLOSING — ink band
         ═══════════════════════════════════ */}
      <section style={{
        background: INK_WARM, color: '#fff',
        padding: 'clamp(80px, 12vh, 160px) 6vw',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.28em', color: GOLD_WARM, marginBottom: 28,
          }}>
            <span style={{ display: 'inline-block', width: 24, height: 1, background: GOLD_WARM, verticalAlign: 'middle', marginRight: 12 }} />
            A Letter
            <span style={{ display: 'inline-block', width: 24, height: 1, background: GOLD_WARM, verticalAlign: 'middle', marginLeft: 12 }} />
          </p>
          <p style={{
            fontFamily: 'var(--font-syne)', fontWeight: 700,
            fontStyle: 'italic',
            fontSize: 'clamp(1.4rem, 2.6vw, 2rem)',
            lineHeight: 1.32,
            letterSpacing: '-0.01em',
            color: '#fff',
            textWrap: 'balance',
            marginBottom: 32,
          }}>
            &ldquo;Come for the beach. Stay for the grandmother&rsquo;s kitchen, the hillside coffee farm, the sound system in the yard. That is the Jamaica worth the flight.&rdquo;
          </p>
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 15,
              color: '#fff', letterSpacing: '-0.005em',
            }}>
              The MAPL Tours Team
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 10.5,
              fontWeight: 500, textTransform: 'uppercase',
              letterSpacing: '0.24em', color: 'rgba(255,255,255,0.55)',
            }}>
              Kingston · Jamaica
            </span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

function toRoman(n: number): string {
  const table: Array<[number, string]> = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of table) {
    while (n >= v) { out += s; n -= v }
  }
  return out
}
