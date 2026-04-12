'use client'

import Image from 'next/image'
import { DESTINATION_IMAGES } from '@/lib/experiences'

const bannerImages: Record<string, string> = {
  about: DESTINATION_IMAGES['Negril'],
  careers: DESTINATION_IMAGES['Kingston'],
  press: DESTINATION_IMAGES['Montego Bay'],
  blog: DESTINATION_IMAGES['Blue Mountains'],
  help: DESTINATION_IMAGES['Ocho Rios'],
  safety: DESTINATION_IMAGES['Portland'],
  accessibility: DESTINATION_IMAGES['Treasure Beach'],
  gifts: DESTINATION_IMAGES['Falmouth'],
}

export default function EditorialPage({
  slug,
  label,
  title,
  children,
}: {
  slug: string
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 56 }}>
      {/* Hero banner */}
      <div style={{
        position: 'relative', height: 240, overflow: 'hidden',
        display: 'flex', alignItems: 'flex-end',
      }}>
        <Image
          src={bannerImages[slug] || bannerImages.about}
          alt={title}
          fill sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 50%' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.1) 100%)',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 28, maxWidth: 900 }}>
          <p style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--gold-warm)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 8,
          }}>
            {label}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 700,
            fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', color: 'white',
            lineHeight: 1.1, letterSpacing: '-0.02em',
          }}>
            {title}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="container" style={{
        maxWidth: 800, paddingTop: 48, paddingBottom: 80,
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 15.5,
          color: 'var(--text-secondary)', lineHeight: 1.75,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{
        fontFamily: 'var(--font-syne)', fontWeight: 700,
        fontSize: 22, color: 'var(--text-primary)',
        marginBottom: 16, letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

export function ValueCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      padding: '24px', borderRadius: 'var(--r-xl)',
      border: '1px solid var(--border)', background: 'var(--bg-warm)',
      marginBottom: 12,
    }}>
      <h3 style={{
        fontFamily: 'var(--font-syne)', fontWeight: 700,
        fontSize: 17, color: 'var(--text-primary)', marginBottom: 8,
      }}>
        {title}
      </h3>
      <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        {desc}
      </p>
    </div>
  )
}
