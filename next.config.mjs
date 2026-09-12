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

    /**
     * Three cannabis-tour posts were removed in e0b6453 and have been
     * answering Google with a 404 ever since. They were still the best
     * performing posts on the site when they went: ganja-farm-tour-ocho-rios
     * was the fourth highest organic landing page in the last 90 days and
     * cannabis-wellness-retreat-jamaica the ninth, so roughly seven of every
     * ten blog visits from search were arriving at "Post not found".
     *
     * Permanent, and deliberately NOT a republish. The removal looks
     * intentional rather than incidental: all three promoted ganja farm,
     * cannabis-culinary and cannabis-retreat TOURS, which MAPL does not sell,
     * while cbd-spa-jamaica covers the same subject from the wellness angle
     * and was left alone. So the reader keeps their answer and Google keeps
     * the signal, without reinstating copy someone chose to take down.
     */
    { source: '/blog/ganja-farm-tour-ocho-rios', destination: '/blog/cbd-spa-jamaica', permanent: true },
    { source: '/blog/cannabis-wellness-retreat-jamaica', destination: '/blog/cbd-spa-jamaica', permanent: true },
    { source: '/blog/jamaica-cannabis-culinary-tour', destination: '/blog/kingston-gastronomy-tour', permanent: true },

    /**
     * The original ten-tour catalogue, replaced by Collin's real products and
     * never redirected. Search Console says these seventeen URLs still carry
     * 1,335 impressions and 13 clicks over 90 days, which is more clicks than
     * the entire rest of the site earned in the same window, and five of them
     * rank between position 8.9 and 12.6. Every one answers with a 404.
     *
     * Each goes to the nearest thing MAPL actually sells. Where there is no
     * equivalent any more (the Kingston food tours, the coffee trek, the
     * luminous lagoon, the fishing trip) the target is /explore: that is the
     * real catalogue for the category, which is what Google asks for when a
     * product is gone, rather than a pretend match that wastes the click.
     */
    { source: '/experience/rastafari-indigenous-village-immersion', destination: '/experience/rasta-cultural-atv-safari', permanent: true },
    { source: '/experience/blue-hole-secret-falls-and-rope-swings', destination: '/experience/blue-hole-and-secret-falls', permanent: true },
    { source: '/experience/reach-falls-and-rabbit-hole-cave-swim', destination: '/experience/blue-hole-and-secret-falls', permanent: true },
    { source: '/experience/dunns-river-falls-and-hidden-blue-hole', destination: '/experience/dunns-river-blue-hole', permanent: true },
    { source: '/experience/mystic-mountain-bobsled-and-rainforest-zipline', destination: '/experience/rainforest-zipline-adventure', permanent: true },
    { source: '/experience/rio-grande-bamboo-rafting', destination: '/experience/bamboo-rafting-on-the-martha-brae', permanent: true },
    { source: '/experience/seven-mile-beach-snorkel-and-rum-punch', destination: '/experience/ricks-cafe-cliff-diving-and-sunset', permanent: true },
    // Both of these are Marley, and Nine Mile is the Marley tour MAPL runs.
    { source: '/experience/bob-marley-heritage-pilgrimage', destination: '/experience/bob-marley-nine-mile-pilgrimage', permanent: true },
    { source: '/experience/reggae-roots-studio-session-and-sound-system', destination: '/experience/bob-marley-nine-mile-pilgrimage', permanent: true },
    // No current equivalent: send to the catalogue rather than fake a match.
    { source: '/experience/luminous-lagoon-bioluminescent-night-swim', destination: '/explore', permanent: true },
    { source: '/experience/glorias-seafood-and-port-royal-history-walk', destination: '/explore', permanent: true },
    { source: '/experience/kingston-street-food-and-market-crawl', destination: '/explore', permanent: true },
    { source: '/experience/sunrise-coffee-trek-and-farm-tasting', destination: '/explore', permanent: true },
    { source: '/experience/miss-ts-kitchen-cooking-experience', destination: '/explore', permanent: true },
    { source: '/experience/jerk-pit-master-class-with-devon', destination: '/explore', permanent: true },
    { source: '/experience/devon-house-patty-and-ice-cream-tour', destination: '/explore', permanent: true },
    { source: '/experience/sunrise-fishing-with-local-fishermen', destination: '/explore', permanent: true },
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
