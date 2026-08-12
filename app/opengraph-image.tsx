import { ImageResponse } from 'next/og'

// Dynamically-generated Open Graph image. Next.js builds it once at build
// time and serves it as /opengraph-image. We previously referenced
// /og-image.png in metadata, but no such file was ever committed, so
// every Twitter / Facebook / iMessage preview broke. Generating it here
// keeps it in code review and avoids committing a binary.

export const runtime = 'edge'
export const alt = 'MAPL Tours Jamaica, Discover Jamaica Beyond the Resort'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0d2b1b 0%, #1b5e3b 55%, #c39a48 100%)',
          color: '#fff',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.18em',
          }}
        >
          MAPL TOURS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: '-0.025em',
              marginBottom: 18,
              maxWidth: 980,
            }}
          >
            Discover Jamaica beyond the resort.
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 400,
              lineHeight: 1.4,
              color: 'rgba(255, 255, 255, 0.86)',
              maxWidth: 880,
            }}
          >
            Cliff dives in Negril. Coffee at sunrise in the Blue Mountains. Reggae sessions in Kingston.
            Curated by locals.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 18,
            color: 'rgba(255, 255, 255, 0.72)',
          }}
        >
          <span>mapltours.com</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <span>Kingston</span>
            <span>·</span>
            <span>Negril</span>
            <span>·</span>
            <span>Portland</span>
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
