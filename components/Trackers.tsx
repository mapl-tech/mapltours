'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'

/**
 * Analytics loaders (GA4 + Google Ads tag + Meta Pixel + Hotjar), gated on the
 * visitor's privacy signals.
 *
 * The privacy policy tells visitors they can opt out of analytics via their
 * browser's privacy settings — this is the code that makes that sentence
 * true. A visitor sending Do Not Track or Global Privacy Control gets NO
 * trackers at all: no GA, no Ads tag, no Meta Pixel, and (the sharpest edge)
 * no Hotjar session recording. Everyone else gets exactly the tags layout.tsx
 * used to inline, same ids, same lazyOnload timing.
 *
 * The Meta Pixel id is public by nature (it ships in the browser and appears
 * in every ad account), so it is inlined here the same way the GA and Ads ids
 * are; the SECRET half of Meta tracking is the Conversions API token, which
 * lives only on the server (lib/meta-capi). Purchase and checkout events are
 * NOT fired here: lib/analytics fires them next to the GA events so the two
 * stay in lockstep and the pixel Purchase carries the eventID the server
 * dedupes against.
 *
 * Decided after mount because the signals live on `navigator`/`window`: the
 * server render ships no trackers, and the client adds them only once the
 * visitor is confirmed not to have opted out. lazyOnload made them
 * post-hydration anyway, so this costs nothing.
 */

const META_PIXEL_ID = '1607953960710055'

declare global {
  interface Window {
    globalPrivacyControl?: boolean
  }
}

function optedOut(): boolean {
  if (typeof window === 'undefined') return true
  const dnt =
    navigator.doNotTrack === '1' ||
    // Old Safari/IE spellings still in the wild.
    (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack === '1' ||
    (window as unknown as { doNotTrack?: string }).doNotTrack === '1'
  const gpc =
    window.globalPrivacyControl === true ||
    (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  return dnt || gpc
}

export default function Trackers() {
  const [allowed, setAllowed] = useState(false)
  const pathname = usePathname()
  const firstPath = useRef(true)

  useEffect(() => {
    if (!optedOut()) setAllowed(true)
  }, [])

  // The Meta Pixel's base code fires PageView once on load. In an SPA the
  // route changes without a reload, so fire PageView again on each subsequent
  // navigation (skipping the first, which the base code already counted) to
  // keep view-content audiences and reach accurate.
  useEffect(() => {
    if (!allowed) return
    if (firstPath.current) { firstPath.current = false; return }
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
    if (typeof fbq === 'function') fbq('track', 'PageView')
  }, [allowed, pathname])

  if (!allowed) return null

  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-2JVWPL4GBE" strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-2JVWPL4GBE');
gtag('config', 'AW-18126709990');`}
      </Script>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <Script id="hotjar" strategy="lazyOnload">
        {`(function(h,o,t,j,a,r){
h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
h._hjSettings={hjid:6688839,hjsv:6};
a=o.getElementsByTagName('head')[0];
r=o.createElement('script');r.async=1;
r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
a.appendChild(r);
})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
      </Script>
    </>
  )
}
