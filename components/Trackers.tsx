'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { isTrackedHost } from '@/lib/tracker-gate'
import { META_PIXEL_ID } from '@/lib/meta-match'
import { isPaymentInFlight } from '@/lib/payment-lock'
import {
  consentPromptAllowedOn, onConsentPromptRequest, setConsent, watchConsent,
  type ConsentAnswer, type ConsentDecision,
} from '@/lib/consent'
import ConsentPrompt, { type ConsentPromptMode } from './ConsentPrompt'

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
 * Since Nov 14 2026 a visitor in the UK, the EU or the EEA also gets no
 * trackers until they say yes to the cookie question (lib/consent, which
 * holds the rule; ConsentPrompt, which asks it). This component waits for
 * that answer, shows the question, and is where a yes turns the tags on and
 * a later no switches them off and loads the page again without them.
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

/** GA4's measurement id, as the gtag block below configures it. */
const GA4_ID = 'G-2JVWPL4GBE'

/**
 * Switch off, or back on, what can be switched on a page that already has
 * the tags, without loading it again: Google's documented off switch for a
 * measurement id (the tag sends nothing more for it) with its consent
 * signal, and Meta's (the pixel holds everything until consent is granted
 * again). Our own events stop by themselves: lib/analytics asks
 * trackingOptedOut before every one. Hotjar has no such switch, which is why
 * a no also loads the page again wherever that is safe.
 */
function setTagsRunning(on: boolean): void {
  try {
    const w = window as unknown as Record<string, unknown> & { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void }
    w[`ga-disable-${GA4_ID}`] = !on
    const state = on ? 'granted' : 'denied'
    w.gtag?.('consent', 'update', { ad_storage: state, ad_user_data: state, ad_personalization: state, analytics_storage: state })
    w.fbq?.('consent', on ? 'grant' : 'revoke')
  } catch {
    // Nothing there to switch.
  }
}

export default function Trackers() {
  // 'wait' until the visitor has been placed: the server render and the first
  // client render agree on it, and nothing loads while it stands.
  const [decision, setDecision] = useState<ConsentDecision>('wait')
  const [tracked, setTracked] = useState(false)
  // Opened by the guest from "Cookie Preferences": 0 when it was not, and one
  // more each time it is, so a second press brings the keyboard to it again.
  const [request, setRequest] = useState(0)
  // The button that opened it, so the keyboard goes back there when the card is put away.
  const opener = useRef<HTMLElement | null>(null)
  const watcher = useRef<{ read: () => void; stop: () => void } | null>(null)
  // Whether this page load has put the tags on the page, and whether it has since switched them off.
  const tagsMounted = useRef(false)
  const tagsStopped = useRef(false)
  const pathname = usePathname()
  const firstPath = useRef(true)

  useEffect(() => {
    // Only the live site feeds the live pixel and GA (lib/tracker-gate). The
    // question itself is worked out wherever the page runs, so it can be seen
    // on a dev server, where an answer turns nothing on.
    setTracked(isTrackedHost(window.location.hostname))
    // lib/consent keeps the decision current: at load, on an answer, when the
    // tab is looked at again, and it is the one that looks the country up.
    const watch = watchConsent(setDecision, optedOut)
    watcher.current = watch
    const offOpen = onConsentPromptRequest((from) => {
      opener.current = from
      setRequest((n) => n + 1)
    })
    return () => { watch.stop(); offOpen(); watcher.current = null }
  }, [])

  // On every page of the visit: the answer is a cookie, and another tab can
  // change it. A card the guest opened does not follow them to the next page.
  useEffect(() => {
    watcher.current?.read()
    setRequest(0)
    opener.current = null
  }, [pathname])

  const allowed = tracked && decision === 'allow'

  // A tag cannot be taken off a page that has it. When the answer stops being
  // yes (here, in another tab, on the bio page, or because it lapsed), switch
  // off what can be switched off at once, and load the page again without the
  // tags as soon as that cannot cost the guest anything: never on a page
  // where they pay or sign in, and never while a payment is going through.
  // Leaving such a page for another one is that moment, which is why the
  // page's address is watched too.
  useEffect(() => {
    if (allowed) {
      tagsMounted.current = true
      if (tagsStopped.current) { tagsStopped.current = false; setTagsRunning(true) }
      return
    }
    if (!tagsMounted.current || decision === 'wait') return
    tagsStopped.current = true
    setTagsRunning(false)
    if (consentPromptAllowedOn(pathname) && !isPaymentInFlight()) window.location.reload()
  }, [allowed, decision, pathname])

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

  /** Put away a card the guest opened, and give the keyboard back to the button that opened it, without moving the page. */
  const close = () => {
    setRequest(0)
    const back = opener.current
    opener.current = null
    if (back && document.contains(back)) back.focus({ preventScroll: true })
  }

  const answer = (a: ConsentAnswer) => {
    // Before the answer is recorded, because recording a no clears the tags'
    // cookies: a tag still running would write them straight back as the page goes.
    if (a === 'no' && tagsMounted.current) { tagsStopped.current = true; setTagsRunning(false) }
    setConsent(a)
    close()
  }

  const asked = request > 0
  const path = pathname ?? ''
  const mode: ConsentPromptMode | null = asked
    ? (optedOut() ? 'browser' : decision === 'allow' ? 'on' : decision === 'deny' ? 'off' : 'ask')
    : decision === 'ask' && consentPromptAllowedOn(path) ? 'ask' : null

  return (
    <>
      {mode && <ConsentPrompt mode={mode} bare={path.startsWith('/experience')} requested={request} onAnswer={answer} onClose={close} />}
      {allowed && <>
      {/* Google's consent signal comes first, before anything is configured.
          This block only exists once the visitor may be measured: outside the
          UK, the EU and the EEA with no opt-out, or after a yes to the cookie
          question, whose sentence covers the four things Google asks about
          (analytics cookies, advertising cookies, visit data used for ads,
          and ads shown because of a visit). Google does not count ad
          conversions or build audiences from a visitor in that region unless
          it is told they agreed, so without this line their yes would turn
          the tags on and Google would still set their visit aside. If the
          question ever stops covering one of the four, that key must stop
          saying granted. */}
      {/* Internal traffic: open any page once with ?mapl_internal=1 and a
          cookie (a year, not localStorage) marks every later hit with
          traffic_type=internal, before the config calls so the first
          page_view carries it too. The GA4 property's "Define internal
          traffic" rule matches traffic_type equals internal, and the owner
          activates the Internal Traffic data filter in the GA4 admin. */}
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-2JVWPL4GBE" strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
gtag('js', new Date());
(function(){
var internal=/(^|; )mapl_internal=1(;|$)/.test(document.cookie);
if(/[?&]mapl_internal=1(&|$)/.test(location.search)){document.cookie='mapl_internal=1; Max-Age=31536000; Path=/; SameSite=Lax';internal=true;}
if(internal)gtag('set',{traffic_type:'internal'});
})();
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
      </>}
    </>
  )
}
