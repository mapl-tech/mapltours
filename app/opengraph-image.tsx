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

export default async function OG() {
  // The real brand lockup (dark variant, built for dark grounds) instead of
  // tracked-out text. Satori accepts the raw ArrayBuffer as an img src.
  // Co-located with this route on purpose: at edge runtime the file must be
  // bundled with the module, and a path into /public is not resolvable here.
  const logo = await fetch(
    new URL('./og-logo.png', import.meta.url)
  ).then((r) => r.arrayBuffer())

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
        <div style={{ display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo as unknown as string} width={194} height={90} />
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
            Sunset off the Negril cliffs. The climb at Dunn&rsquo;s River. Rafting on the Martha Brae.
            Private transfers from MBJ. Run by locals.
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
            <span>Montego Bay</span>
            <span>·</span>
            <span>Negril</span>
            <span>·</span>
            <span>Ocho Rios</span>
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
