'use client'

import Image from 'next/image'
import { useCartStore } from '@/lib/cart'
import { experiences } from '@/lib/experiences'

const pastTrips = [
  { title: "Rick's Cafe Cliff Diving", destination: 'Negril', date: 'Dec 2024', rating: 5, image: experiences[0].image },
  { title: 'Sunrise Coffee Trek', destination: 'Blue Mountains', date: 'Oct 2024', rating: 5, image: experiences[1].image },
  { title: 'Reggae Roots Studio Session', destination: 'Kingston', date: 'Aug 2024', rating: 4, image: experiences[2].image },
]

const savedCreators = [
  { handle: 'yardie.adventures', followers: '287K', image: experiences[0].image },
  { handle: 'jerk.legend', followers: '156K', image: experiences[3].image },
  { handle: 'roots.culture', followers: '312K', image: experiences[5].image },
]

export default function ProfileView() {
  const items = useCartStore((s) => s.items)

  return (
    <div style={{ minHeight: '100vh', paddingTop: 72 }}>
      {/* ── Hero ── */}
      <div style={{
        position: 'relative', height: 220, overflow: 'hidden',
        background: 'linear-gradient(145deg, #0A2E1A 0%, #1A5A3A 50%, #2D8A5A 100%)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%)' }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold), var(--gold-warm))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 34, border: '3px solid rgba(255,255,255,0.2)', flexShrink: 0,
          }}>
            🧳
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 24, color: 'white', marginBottom: 3 }}>
              Alex Wanderlust
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-dm-sans)' }}>
              Toronto · Member since 2024
            </p>
          </div>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 760, paddingTop: 36, paddingBottom: 80 }}>
        {/* ── Stats ── */}
        <div style={{
          display: 'flex', borderRadius: 'var(--r-lg)', overflow: 'hidden',
          border: '1px solid var(--border)', marginBottom: 32,
        }}>
          {[{ label: 'Trips', value: '3' }, { label: 'Parishes', value: '4' }, { label: 'Saved', value: '12' }].map((s, i) => (
            <div key={s.label} style={{
              flex: 1, textAlign: 'center', padding: '22px 0', background: '#fff',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 24, marginBottom: 3 }}>{s.value}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Badges ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
          {['🇯🇲 Jamaica Verified', '⭐ Top Reviewer', '🌴 3 Trips Completed'].map((b) => (
            <span key={b} className="tag" style={{ background: '#fff', border: '1px solid var(--border)', padding: '5px 14px', fontSize: 12.5 }}>{b}</span>
          ))}
        </div>

        {/* ── Sections ── */}
        {[
          {
            title: 'Upcoming trips',
            content: items.length === 0
              ? <div className="surface-card" style={{ padding: 36, textAlign: 'center' }}><p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>No upcoming trips. Start exploring! 🌴</p></div>
              : items.map((item) => (
                <div key={item.id} className="surface-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                    <Image src={item.image} alt={item.title} fill sizes="48px" style={{ objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>{item.date} · {item.travelers} travelers</p>
                  </div>
                </div>
              )),
          },
          {
            title: 'Past trips',
            content: pastTrips.map((t) => (
              <div key={t.title} className="surface-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                  <Image src={t.image} alt={t.title} fill sizes="48px" style={{ objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>{t.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>{t.destination} · {t.date}</p>
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--gold)', fontFamily: 'var(--font-dm-sans)' }}>{'★'.repeat(t.rating)}</span>
              </div>
            )),
          },
          {
            title: 'Saved creators',
            content: savedCreators.map((c) => (
              <div key={c.handle} className="surface-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                  <Image src={c.image} alt={c.handle} fill sizes="40px" style={{ objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }}>@{c.handle}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)', marginTop: 1 }}>{c.followers} followers</p>
                </div>
                <button className="btn-outline" style={{ height: 30, padding: '0 14px', fontSize: 12 }}>Following</button>
              </div>
            )),
          },
        ].map((section) => (
          <section key={section.title} style={{ marginBottom: 36 }}>
            <h3 className="text-headline" style={{ fontSize: 17, marginBottom: 14 }}>{section.title}</h3>
            {section.content}
          </section>
        ))}
      </div>
    </div>
  )
}
