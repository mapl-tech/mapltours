'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Leaf, Mail, Clock, Send, Check, Camera, Music2 } from 'lucide-react'
import { DESTINATION_IMAGES } from '@/lib/experiences'

export default function ContactView() {
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  // Honeypot, hidden from real users via CSS. Bots will fill it; the
  // server silently discards any submission where this isn't empty.
  const [website, setWebsite] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, website }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'We couldn’t deliver your message. Please try again.')
        return
      }
      setSent(true)
    } catch {
      setError('Network error, please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--nav-h)' }}>
      {/* Hero banner */}
      <div style={{
        position: 'relative', height: 280, overflow: 'hidden',
        display: 'flex', alignItems: 'flex-end',
      }}>
        <Image
          src={DESTINATION_IMAGES['Negril']}
          alt="Jamaica coastline"
          fill sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 60%' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.15) 100%)',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 32 }}>
          <p style={{
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--gold-warm)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 8,
          }}>
            Get in touch
          </p>
          <h1 style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'var(--fs-h2)', color: 'white',
            lineHeight: 1.1, letterSpacing: '-0.02em',
          }}>
            Contact Us
          </h1>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 1000, paddingTop: 48, paddingBottom: 80 }}>
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          {/* Left - Contact info */}
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'var(--surface)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Leaf size={18} color="var(--accent)" />
                </div>
                <div style={{ lineHeight: 1 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>MAPL TOURS</span>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', display: 'block', marginTop: 1 }}>Tours Jamaica</span>
                </div>
              </div>
              <p style={{
                fontSize: 15, color: 'var(--text-secondary)',
                fontFamily: 'var(--font-dm-sans)', lineHeight: 1.65,
                maxWidth: 340,
              }}>
                We are here to help you plan the perfect Jamaica experience. Reach out and our team will get back to you within 24 hours.
              </p>
            </div>

            {/* Contact details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
              {[
                { icon: <Mail size={16} />, label: 'Email', value: 'contact@mapltours.com' },
                { icon: <Clock size={16} />, label: 'Hours', value: '24/7' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 'var(--r-md)',
                    background: 'var(--surface)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 3 }}>
                      {item.label}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Social */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 12 }}>
                Follow us
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { icon: <Camera size={16} />, label: 'Instagram', href: 'https://www.instagram.com/mapltoursjamaica' },
                  { icon: <Music2 size={16} />, label: 'TikTok', href: 'https://www.tiktok.com/@mapltoursjamaica' },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`MAPL TOURS on ${s.label}`}
                    title={s.label}
                    style={{
                      width: 44, height: 44, borderRadius: 'var(--r-md)',
                      background: 'var(--surface)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                      transition: 'all 0.15s ease', textDecoration: 'none',
                    }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Right - Form */}
          <div style={{ flex: '1.2 1 360px' }}>
            {sent ? (
              <div style={{
                borderRadius: 'var(--r-xl)', border: '1px solid var(--border)',
                background: '#fff', padding: 48, textAlign: 'center',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--emerald)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', color: '#fff',
                }}>
                  <Check size={26} strokeWidth={2.5} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
                  Message Sent
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6 }}>
                  Thank you for reaching out. Our team will get back to you within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{
                borderRadius: 'var(--r-xl)', border: '1px solid var(--border)',
                background: '#fff', padding: 32,
              }}>
                <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
                  Send us a message
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginBottom: 24 }}>
                  We would love to hear from you
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label htmlFor="contact-name" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', display: 'block', marginBottom: 6 }}>Name</label>
                      <input id="contact-name" className="field-input" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div>
                      <label htmlFor="contact-email" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', display: 'block', marginBottom: 6 }}>Email</label>
                      <input id="contact-email" className="field-input" type="email" placeholder="you@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-subject" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', display: 'block', marginBottom: 6 }}>Subject</label>
                    <input id="contact-subject" className="field-input" placeholder="How can we help?" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                  </div>
                  <div>
                    <label htmlFor="contact-message" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)', display: 'block', marginBottom: 6 }}>Message</label>
                    <textarea id="contact-message" className="field-input" placeholder="Tell us about your trip plans, questions, or feedback..." rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
                  </div>
                  {/* Honeypot, kept off-screen so real users never see it. */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
                    aria-hidden="true"
                  />
                  {error ? (
                    <p style={{ fontSize: 13, color: '#c00', fontFamily: 'var(--font-dm-sans)', margin: 0 }}>
                      {error}
                    </p>
                  ) : null}
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={submitting}
                    style={{ width: '100%', height: 48, fontSize: 14, marginTop: 4, gap: 8, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'wait' : 'pointer' }}
                  >
                    <Send size={16} /> {submitting ? 'Sending…' : 'Send Message'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
