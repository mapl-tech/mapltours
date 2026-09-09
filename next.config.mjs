/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build run without clobbering the dev server's .next
  ...(process.env.NEXT_BUILD_DIST ? { distDir: process.env.NEXT_BUILD_DIST } : {}),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'www.restaurantsjamaican.com' },
      { protocol: 'https', hostname: 'www.rickscafejamaica.com' },
      { protocol: 'https', hostname: 'ichef.bbci.co.uk' },
      { protocol: 'https', hostname: 'img.rezdy.com' },
      { protocol: 'https', hostname: 'media-cdn.tripadvisor.com' },
      { protocol: 'https', hostname: 'dynamic-media-cdn.tripadvisor.com' },
      { protocol: 'https', hostname: 'paradiseinjatours.com' },
      { protocol: 'https', hostname: 'jamdownfoodie.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'www.researchgate.net' },
      { protocol: 'https', hostname: 'oaccessjamaica.com' },
      { protocol: 'https', hostname: 'media.tacdn.com' },
      { protocol: 'https', hostname: 'mobayvacations.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  redirects: async () => [
    // Social bio links. The profile shows a clean short URL; the redirect
    // carries the attribution tags, which both GA and lib/attribution read
    // off the landing URL. Temporary (307) so the tagging can evolve
    // without browsers caching a stale destination.
    { source: '/ig', destination: '/?utm_source=instagram&utm_medium=bio', permanent: false },
    { source: '/tt', destination: '/?utm_source=tiktok&utm_medium=bio', permanent: false },
  ],
  headers: async () => [
    // Videos — immutable, 1 year
    {
      source: '/:path*.mp4',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/:path*.webm',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    // Static assets — immutable, 1 year
    {
      source: '/:path*.woff2',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    // Images in public — 30 days
    {
      source: '/images/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
      ],
    },
    // HTML pages — short cache with revalidation
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Turn off browser features this site never uses, so a script that
        // does get injected cannot reach for the camera, the microphone or
        // the visitor's location. Zero risk: nothing here is used by Stripe,
        // Hotjar or the tag manager, and the site asks for none of it.
        {
          key: 'Permissions-Policy',
          value: [
            'camera=()', 'microphone=()', 'geolocation=()', 'payment=(self)',
            'usb=()', 'magnetometer=()', 'gyroscope=()', 'accelerometer=()',
            'interest-cohort=()',
          ].join(', '),
        },
        // Content-Security-Policy, deliberately in REPORT-ONLY.
        //
        // This site takes card payments. An enforcing policy that is missing
        // one Stripe origin does not degrade, it stops customers paying, and
        // the payment element cannot be exercised here without creating a
        // real booking and a real PaymentIntent. So the policy ships in the
        // mode that reports violations and blocks nothing.
        //
        // TO PROMOTE IT: take one real payment end to end with devtools open,
        // confirm the console logs no CSP violation, then rename this key to
        // 'Content-Security-Policy'. Until then it is documentation that the
        // browser checks for you.
        //
        // 'unsafe-inline' and 'unsafe-eval' are present because Next.js
        // inlines hydration scripts and the tag manager evaluates its
        // container. Removing them needs per-request nonces, which is a
        // separate piece of work.
        {
          key: 'Content-Security-Policy-Report-Only',
          value: [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://static.hotjar.com https://script.hotjar.com https://www.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com https://script.hotjar.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob:",
            "frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com https://vars.hotjar.com",
            "connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.hotjar.com https://*.hotjar.io wss://*.hotjar.com https://api.supabase.com",
            "worker-src 'self' blob:",
            "upgrade-insecure-requests",
          ].join('; '),
        },
      ],
    },
  ],
};

export default nextConfig;
