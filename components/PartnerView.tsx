'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { DESTINATION_IMAGES } from '@/lib/experiences'
import Footer from './Footer'

/**
 * Partner with us.
 *
 * Written for two audiences at once — an individual creator with one great
 * experience, and an established tour company with a fleet — so the page keeps
 * naming both rather than pretending they want the same thing.
 *
 * Commercial terms are deliberately left to a conversation. Every rate we
 * would print here (commission, payout timing) varies by what someone runs,
 * and a number on a public page becomes a promise.
 */

const INK = '#171614'

const WHO = [
  {
    kicker: '01',
    title: 'Guides and creators',
    body: 'You run something worth travelling for — a jerk pit, a river trip, a studio session, a hike you know better than anyone. You want guests without living inside a booking inbox.',
  },
  {
    kicker: '02',
    title: 'Tour companies',
    body: 'You already operate at volume and want another channel that fills seats without discounting your product or handing your guests to a reseller who renames it.',
  },
  {
    kicker: '03',
    title: 'Drivers and transport operators',
    body: 'You run licensed, insured vehicles and want steady itinerary work and airport runs rather than chasing fares at the terminal.',
  },
  {
    kicker: '04',
    title: 'Restaurants and attractions',
    body: 'You want to be on the itinerary before guests arrive on the island. Listings are free, guests pay you directly at your own price, and we take nothing.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Tell us what you run',
    body: 'The form below, or an email. What the experience is, where it happens, how many guests you can take, and what you charge.',
  },
  {
    n: '2',
    title: 'We come and do it',
    body: 'Someone from MAPL TOURS books it like a guest would and goes. No clipboard, no inspection — we want to see the day a traveller would actually get.',
  },
  {
    n: '3',
    title: 'We build the listing',
    body: 'Photography, the write-up, pricing and the booking flow are ours to build. You approve it before it goes live, and it stays yours — your name on it, not a white label.',
  },
  {
    n: '4',
    title: 'Guests arrive',
    body: 'Bookings land with the details you need — names, numbers, dates, dietary notes, pickup point. You deliver the experience. We handle everything around it.',
  },
]

const WE_HANDLE = [
  'Listing, photography and the write-up',
  'Payments, receipts and refunds through Stripe',
  'Marketing across the site, search and social',
  'Guest questions before and after the day',
  'Private transport to you and back',
  'Cancellations and reschedules',
]

const YOU_HANDLE = [
  'Delivering the experience as listed',
  'Your own licensing, permits and insurance',
  'Safety briefings and appropriate equipment',
  'Telling us early when something changes',
]

const STANDARDS = [
  {
    title: 'It has to be real',
    body: 'Something you would take your own family to. We are not looking for another catamaran with a rum bar, and travellers can tell the difference before they book.',
  },
  {
    title: 'It has to be safe',
    body: 'Current licensing and insurance for what you run, equipment that is maintained, and a briefing guests actually understand. We will ask, and we will ask again.',
  },
  {
    title: 'It has to be Jamaican',
    body: 'Owned and run by people from here, us included. The whole point of MAPL TOURS is that the island is not a backdrop — it is the people who know it.',
  },
  {
    title: 'It has to be dependable',
    body: 'If you say ten o\u2019clock, it is ten o\u2019clock. One missed pickup undoes a guest\u2019s whole trip, and it is our name on the confirmation too.',
  },
]

export default function PartnerView() {
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', business: '', parish: '', kind: '', message: '',
  })
  // Honeypot, same as the contact form. Real people never fill this in.
  const [website, setWebsite] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      // Reuses /api/contact rather than adding another inbox: it already has
      // the honeypot, the rate limit and the auto-reply. The subject line is
      // what routes it to the right person.
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          subject: `Partner enquiry · ${form.kind || 'General'}${form.business ? ` · ${form.business}` : ''}`,
          message:
            `Business / operation: ${form.business || '(not given)'}\n` +
            `Parish or area: ${form.parish || '(not given)'}\n` +
            `Type: ${form.kind || '(not given)'}\n\n` +
            form.message,
          website,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'We could not send that. Please try again, or email contact@mapltours.com.')
        return
      }
      setSent(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--nav-h)', background: 'var(--bg)', color: INK }}>

      {/* ═══════════════════════════════════
         HERO
         ═══════════════════════════════════ */}
      <section style={{
        position: 'relative',
        height: 'min(72vh, 700px)',
        minHeight: 480,
        width: '100%',
        overflow: 'hidden',
        background: INK,
      }}>
        <Image
          src={DESTINATION_IMAGES['Portland']}
          alt="Jamaica"
          fill priority sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 55%' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, rgba(23,22,20,0.88) 0%, rgba(23,22,20,0.45) 55%, rgba(23,22,20,0.30) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'rgba(255,255,255,0.14)',
        }} />

        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          maxWidth: 1260, margin: '0 auto',
          padding: '0 6vw clamp(48px, 7vh, 88px)',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 11,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.24em', color: 'var(--gold-warm)', marginBottom: 20,
          }}>
            Partner with us
          </p>
          <h1 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'clamp(2rem, 5vw, 3.75rem)',
            lineHeight: 1.05, letterSpacing: '-0.028em',
            color: 'white', marginBottom: 22, maxWidth: 900, textWrap: 'balance',
          }}>
            We run tours in Jamaica.<br />We want the whole island on the itinerary.
          </h1>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 'clamp(15px, 1.5vw, 18px)',
            lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', maxWidth: 620,
          }}>
            MAPL TOURS JAMAICA runs its own guided experiences and its own private
            airport transfers. Ten parishes of road. We also work with Jamaican guides,
            tour companies, drivers, restaurants and attractions &mdash; under their own
            names, in front of travellers who came here for exactly that.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════
         OPENING
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1260, margin: '0 auto',
        padding: 'clamp(56px, 8vh, 104px) 6vw clamp(40px, 6vh, 72px)',
      }}>
        <div style={{ maxWidth: 780 }}>
          <h2 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'clamp(1.4rem, 2.6vw, 2.125rem)',
            lineHeight: 1.18, letterSpacing: '-0.018em',
            color: INK, marginBottom: 24, textWrap: 'balance',
          }}>
            Everything we ask of a partner, we already do ourselves.
          </h2>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 16.5,
            lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 18,
          }}>
            MAPL TOURS JAMAICA is an operator. On the experiences we run, our name is on
            the itinerary, our driver is at the airport, and the guest&rsquo;s whole day is
            ours from pickup to drop-off. Twenty-two experiences and forty-four restaurants
            and sites sit on the site today &mdash; ours and other people&rsquo;s &mdash;
            across ten parishes of road.
          </p>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 16.5,
            lineHeight: 1.8, color: 'var(--text-secondary)',
          }}>
            So nobody has to explain the job to us. The early start. The party that books
            for four and turns up with six. The rain that moves everything an hour to the
            left. We would rather put your day on the site than invent our own version of
            it, and there is far more worth doing on this island than we run ourselves.
            We know that because we drive it &mdash; you cannot spend that much time on the
            road without passing somebody doing something better than what the lobby desk
            is selling.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════
         WHO WE WORK WITH
         ═══════════════════════════════════ */}
      <section style={{ background: '#FAF9F7' }}>
        <div style={{
          maxWidth: 1260, margin: '0 auto',
          padding: 'clamp(56px, 8vh, 100px) 6vw',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 11,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.24em', color: 'var(--gold-text)', marginBottom: 32,
          }}>
            Who we work with
          </p>

          <div className="partner-grid">
            {WHO.map((w) => (
              <div key={w.title} style={{ borderTop: '1px solid rgba(23,22,20,0.14)', paddingTop: 22 }}>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: 12,
                  fontWeight: 700, color: 'var(--gold-text)',
                  letterSpacing: '0.1em', marginBottom: 12,
                }}>
                  {w.kicker}
                </p>
                <h3 style={{
                  fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                  fontSize: 19, color: INK, marginBottom: 10, letterSpacing: '-0.01em',
                }}>
                  {w.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: 15,
                  lineHeight: 1.72, color: 'var(--text-secondary)',
                }}>
                  {w.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
         HOW IT WORKS
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1260, margin: '0 auto',
        padding: 'clamp(56px, 8vh, 100px) 6vw',
      }}>
        <div className="about-split">
          <div className="about-split-img">
            <Image
              src={DESTINATION_IMAGES['Treasure Beach']}
              alt="Treasure Beach, Jamaica"
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
              fontFamily: 'var(--font-dm-sans)', fontSize: 11,
              fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              Treasure Beach · St. Elizabeth
            </div>
          </div>

          <div className="about-split-copy">
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 11,
              fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.24em', color: 'var(--gold-text)', marginBottom: 18,
            }}>
              How it works
            </p>
            <h2 style={{
              fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
              fontSize: 'clamp(1.5rem, 2.6vw, 2.125rem)',
              lineHeight: 1.14, letterSpacing: '-0.018em',
              color: INK, marginBottom: 28, textWrap: 'balance',
            }}>
              Four steps, and no cost to find out.
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 16 }}>
                  <div style={{
                    flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
                    background: 'rgba(196,164,74,0.16)',
                    border: '1px solid rgba(166,139,60,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                    fontSize: 13, color: 'var(--gold-text)',
                  }}>
                    {s.n}
                  </div>
                  <div>
                    <h3 style={{
                      fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                      fontSize: 16.5, color: INK, marginBottom: 5,
                    }}>
                      {s.title}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: 14.5,
                      lineHeight: 1.7, color: 'var(--text-secondary)',
                    }}>
                      {s.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
         SPLIT OF WORK
         ═══════════════════════════════════ */}
      <section style={{ background: INK, color: 'white' }}>
        <div style={{
          maxWidth: 1260, margin: '0 auto',
          padding: 'clamp(56px, 8vh, 100px) 6vw',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 11,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.24em', color: 'var(--gold-warm)', marginBottom: 16,
          }}>
            Who does what
          </p>
          <h2 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'clamp(1.5rem, 2.6vw, 2.125rem)',
            lineHeight: 1.14, letterSpacing: '-0.018em',
            color: 'white', marginBottom: 40, maxWidth: 620, textWrap: 'balance',
          }}>
            No good day belongs to one operator.
          </h2>

          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 16,
            lineHeight: 1.75, color: 'rgba(255,255,255,0.72)',
            maxWidth: 680, marginTop: -22, marginBottom: 40,
          }}>
            You run your experience. We run the road &mdash; same as we do for our own.
            Where MAPL TOURS JAMAICA is the operator, the page says so. Where you are,
            your name is on it.
          </p>

          <div className="partner-split">
            <div>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.14em',
                color: 'var(--gold-warm)', marginBottom: 18,
              }}>
                MAPL TOURS handles
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {WE_HANDLE.map((item) => (
                  <li key={item} style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: 15,
                    lineHeight: 1.6, color: 'rgba(255,255,255,0.80)',
                    paddingLeft: 20, position: 'relative',
                  }}>
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: 8,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--gold-warm)',
                    }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.14em',
                color: 'rgba(255,255,255,0.55)', marginBottom: 18,
              }}>
                You handle
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {YOU_HANDLE.map((item) => (
                  <li key={item} style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: 15,
                    lineHeight: 1.6, color: 'rgba(255,255,255,0.80)',
                    paddingLeft: 20, position: 'relative',
                  }}>
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: 8,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.35)',
                    }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p style={{
            marginTop: 40, paddingTop: 24,
            borderTop: '1px solid rgba(255,255,255,0.14)',
            fontFamily: 'var(--font-dm-sans)', fontSize: 14.5,
            lineHeight: 1.75, color: 'rgba(255,255,255,0.62)', maxWidth: 720,
          }}>
            Commission and payout terms depend on what you run and how often, so we
            agree them with you directly rather than printing a number that would not
            fit your operation. Nothing is exclusive &mdash; keep selling your
            experience anywhere else you already do.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════
         STANDARDS
         ═══════════════════════════════════ */}
      <section style={{
        maxWidth: 1260, margin: '0 auto',
        padding: 'clamp(56px, 8vh, 100px) 6vw',
      }}>
        <p style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 11,
          fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.24em', color: 'var(--gold-text)', marginBottom: 16,
        }}>
          What we look for
        </p>
        <h2 style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
          fontSize: 'clamp(1.5rem, 2.6vw, 2.125rem)',
          lineHeight: 1.14, letterSpacing: '-0.018em',
          color: INK, marginBottom: 36, maxWidth: 640, textWrap: 'balance',
        }}>
          We say no more than we say yes, and that is the point.
        </h2>

        <div className="partner-grid">
          {STANDARDS.map((s) => (
            <div key={s.title} style={{
              padding: '26px 26px 28px',
              borderRadius: 'var(--r-xl)',
              border: '1px solid var(--border)',
              background: 'var(--bg-warm)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                fontSize: 17, color: INK, marginBottom: 10,
              }}>
                {s.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 14.5,
                lineHeight: 1.72, color: 'var(--text-secondary)',
              }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════
         APPLY
         ═══════════════════════════════════ */}
      <section id="apply" style={{ background: '#FAF9F7', scrollMarginTop: 'var(--nav-h)' }}>
        <div style={{
          maxWidth: 1260, margin: '0 auto',
          padding: 'clamp(56px, 8vh, 100px) 6vw',
        }}>
          <div className="partner-apply">
            <div>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 11,
                fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.24em', color: 'var(--gold-text)', marginBottom: 16,
              }}>
                Get in touch
              </p>
              <h2 style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                fontSize: 'clamp(1.5rem, 2.6vw, 2.125rem)',
                lineHeight: 1.14, letterSpacing: '-0.018em',
                color: INK, marginBottom: 20, textWrap: 'balance',
              }}>
                Tell us what you run.
              </h2>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 15.5,
                lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: 16,
              }}>
                A few lines is plenty. We read every one and reply within two working days.
              </p>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 15.5,
                lineHeight: 1.75, color: 'var(--text-secondary)',
              }}>
                Prefer email? Write to{' '}
                <a
                  href="mailto:contact@mapltours.com?subject=Partner%20enquiry"
                  style={{ color: INK, fontWeight: 600, textDecoration: 'underline' }}
                >
                  contact@mapltours.com
                </a>
                .
              </p>
            </div>

            <div style={{
              background: 'var(--card-bg)',
              borderRadius: 'var(--r-xl)',
              border: '1px solid var(--border)',
              padding: 'clamp(24px, 3vw, 34px)',
            }}>
              {sent ? (
                <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                  <p style={{ fontSize: 34, marginBottom: 12 }} aria-hidden>🇯🇲</p>
                  <h3 style={{
                    fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
                    fontSize: 20, color: INK, marginBottom: 10,
                  }}>
                    Got it. Thank you.
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: 14.5,
                    lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: 22,
                  }}>
                    We&rsquo;ll read it properly and come back to you within two working
                    days. If it looks like a fit, the next step is us booking it as a guest.
                  </p>
                  <Link
                    href="/explore"
                    className="btn-outline"
                    style={{
                      display: 'inline-flex', alignItems: 'center', height: 42,
                      padding: '0 24px', fontSize: 14, fontWeight: 600,
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    See what we already run
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="partner-fields">
                      <div>
                        <Label htmlFor="partner-name">Your name</Label>
                        <input
                          id="partner-name" className="field-input" required
                          placeholder="Your name"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="partner-email">Email</Label>
                        <input
                          id="partner-email" className="field-input" type="email" required
                          placeholder="you@email.com"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="partner-fields">
                      <div>
                        <Label htmlFor="partner-business">Business or operation</Label>
                        <input
                          id="partner-business" className="field-input"
                          placeholder="Name, or your own if it’s just you"
                          value={form.business}
                          onChange={(e) => setForm({ ...form, business: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="partner-parish">Parish or area</Label>
                        <input
                          id="partner-parish" className="field-input"
                          placeholder="e.g. Portland"
                          value={form.parish}
                          onChange={(e) => setForm({ ...form, parish: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="partner-kind">What do you run?</Label>
                      <select
                        id="partner-kind" className="field-input"
                        value={form.kind}
                        onChange={(e) => setForm({ ...form, kind: e.target.value })}
                        style={{ appearance: 'none' }}
                      >
                        <option value="">Choose one</option>
                        <option>Guided experience or tour</option>
                        <option>Tour company</option>
                        <option>Driver or transport</option>
                        <option>Restaurant or food spot</option>
                        <option>Attraction or heritage site</option>
                        <option>Something else</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="partner-message">Tell us about it</Label>
                      <textarea
                        id="partner-message" className="field-input" required rows={5}
                        placeholder="What happens on the day, how long it takes, how many guests you can take, and what you charge."
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                      />
                    </div>

                    {/* Honeypot: hidden from people, irresistible to bots. */}
                    <input
                      type="text" name="website" tabIndex={-1} autoComplete="off"
                      value={website} onChange={(e) => setWebsite(e.target.value)}
                      aria-hidden="true"
                      style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                    />

                    {error && (
                      <p role="alert" style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: 13.5,
                        color: '#c00', lineHeight: 1.55,
                      }}>
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submitting}
                      style={{
                        width: '100%', height: 48, marginTop: 4,
                        fontSize: 15, fontWeight: 700,
                        opacity: submitting ? 0.6 : 1,
                        cursor: submitting ? 'wait' : 'pointer',
                      }}
                    >
                      {submitting ? 'Sending…' : 'Send enquiry'}
                    </button>

                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: 12.5,
                      color: 'var(--text-tertiary)', lineHeight: 1.6, textAlign: 'center',
                    }}>
                      No cost, and no commitment.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block', fontFamily: 'var(--font-dm-sans)',
        fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
      }}
    >
      {children}
    </label>
  )
}
