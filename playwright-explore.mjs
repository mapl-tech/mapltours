// Exploratory bug-hunt walkthrough of MAPL Tours.
// Captures console errors, page errors, failed network requests, broken images,
// and dead-end interactions across the main routes.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = path.resolve('./playwright-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const findings = [];
const note = (route, severity, msg, extra = {}) => {
  findings.push({ route, severity, msg, ...extra });
  console.log(`[${severity}] ${route} :: ${msg}`);
};

const ROUTES = [
  '/',
  '/explore',
  '/profile',
  '/checkout',
  '/transfers',
  '/about',
  '/contact',
  '/help',
  '/safety',
  '/accessibility',
  '/blog',
  '/careers',
  '/press',
  '/gifts',
  '/login',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  // Per-page listeners attached for entire session — we tag the current route.
  let currentRoute = '/';
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      note(currentRoute, t === 'error' ? 'console-error' : 'console-warn', msg.text().slice(0, 400));
    }
  });
  page.on('pageerror', err => {
    note(currentRoute, 'page-error', `${err.name}: ${err.message}`.slice(0, 400));
  });
  page.on('requestfailed', req => {
    note(currentRoute, 'request-failed', `${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', resp => {
    const status = resp.status();
    const url = resp.url();
    if (status >= 400 && !url.includes('/_next/static')) {
      note(currentRoute, 'http-' + status, `${resp.request().method()} ${url}`);
    }
  });

  for (const route of ROUTES) {
    currentRoute = route;
    console.log(`\n=== Visiting ${route} ===`);
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      if (!resp) {
        note(route, 'nav-error', 'no response');
        continue;
      }
      if (resp.status() >= 400) {
        note(route, 'nav-status', `top-level status ${resp.status()}`);
      }
      // Wait briefly for client hydration & lazy fetches.
      await page.waitForTimeout(1200);

      // Check for visible "error", "404", or stack-trace style content.
      const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
      if (bodyText.includes('application error') || bodyText.includes('this page could not be found') || bodyText.includes('something went wrong')) {
        note(route, 'visible-error', 'error/404 text on page');
      }

      // Check broken images (naturalWidth === 0 after load).
      const brokenImgs = await page.$$eval('img', imgs =>
        imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src).slice(0, 8)
      );
      brokenImgs.forEach(src => note(route, 'broken-image', src));

      // Links to external/internal href="#" or empty.
      const badLinks = await page.$$eval('a', as =>
        as.filter(a => {
          const h = a.getAttribute('href');
          return h === '' || h === '#';
        }).map(a => a.outerHTML.slice(0, 160)).slice(0, 5)
      );
      badLinks.forEach(html => note(route, 'dead-link', html));

      // Buttons with no text and no aria-label.
      const unlabeledButtons = await page.$$eval('button', bs =>
        bs.filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.querySelector('svg, img')).length
      );
      if (unlabeledButtons > 0) note(route, 'a11y', `${unlabeledButtons} button(s) with no text or aria-label`);

      // Screenshot.
      const shot = path.join(SHOTS, route.replace(/\//g, '_') || '_root') + '.png';
      await page.screenshot({ path: shot, fullPage: false });
    } catch (e) {
      note(route, 'nav-exception', e.message.slice(0, 300));
    }
  }

  // ---- Functional flows ----

  // Flow 1: feed -> add to cart -> open itinerary -> go to checkout
  console.log('\n=== FLOW: add-to-cart from feed ===');
  currentRoute = '/(flow:add-to-cart)';
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const addBtns = page.getByRole('button', { name: /add to itinerary/i });
    const addCount = await addBtns.count();
    if (addCount === 0) {
      note(currentRoute, 'flow', 'no "Add to Itinerary" button found on feed');
    } else {
      await addBtns.first().click();
      await page.waitForTimeout(600);
      const addedNow = await page.getByRole('button', { name: /added to trip/i }).count();
      if (addedNow === 0) note(currentRoute, 'flow', 'click did not flip CTA to "Added to Trip"');
    }

    // Cart badge in LeftNav?
    const navCart = await page.locator('a[href="/checkout"]').count();
    if (navCart === 0) note(currentRoute, 'flow', 'no checkout link in nav after add');

    await page.goto(BASE + '/checkout', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const checkoutText = (await page.locator('body').innerText()).toLowerCase();
    if (!checkoutText.includes('checkout') && !checkoutText.includes('itinerary')) {
      note(currentRoute, 'flow', 'checkout page missing expected words');
    }
  } catch (e) {
    note(currentRoute, 'flow-exception', e.message.slice(0, 300));
  }

  // Flow 2: explore -> search/filter
  console.log('\n=== FLOW: explore filters ===');
  currentRoute = '/(flow:explore)';
  try {
    await page.goto(BASE + '/explore', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder]').first();
    if (await searchInput.count()) {
      await searchInput.fill('jerk');
      await page.waitForTimeout(800);
      const resultCount = await page.locator('text=/jerk/i').count();
      if (resultCount === 0) note(currentRoute, 'flow', 'searching "jerk" returned 0 visible matches');
    } else {
      note(currentRoute, 'flow', 'no search input found on explore');
    }
  } catch (e) {
    note(currentRoute, 'flow-exception', e.message.slice(0, 300));
  }

  // Flow 3: experience detail (sample slug from feed link)
  console.log('\n=== FLOW: experience detail ===');
  currentRoute = '/(flow:experience-detail)';
  try {
    await page.goto(BASE + '/explore', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const expLinks = await page.$$eval('a[href^="/experience/"]', as => as.map(a => a.getAttribute('href')).slice(0, 3));
    if (expLinks.length === 0) {
      note(currentRoute, 'flow', 'no /experience/[slug] links found on /explore');
    } else {
      for (const href of expLinks) {
        currentRoute = href;
        const r = await page.goto(BASE + href, { waitUntil: 'networkidle' });
        if (!r || r.status() >= 400) note(href, 'nav-status', `status ${r?.status()}`);
        await page.waitForTimeout(800);
      }
    }
  } catch (e) {
    note(currentRoute, 'flow-exception', e.message.slice(0, 300));
  }

  // Flow 4: transfers checkout (no items state)
  console.log('\n=== FLOW: transfers ===');
  currentRoute = '/transfers/checkout';
  try {
    const r = await page.goto(BASE + '/transfers/checkout', { waitUntil: 'networkidle' });
    if (!r || r.status() >= 400) note(currentRoute, 'nav-status', `status ${r?.status()}`);
    await page.waitForTimeout(1200);
  } catch (e) {
    note(currentRoute, 'flow-exception', e.message.slice(0, 300));
  }

  await browser.close();

  // Output
  fs.writeFileSync('playwright-findings.json', JSON.stringify(findings, null, 2));
  console.log('\n\n========= SUMMARY =========');
  const bySev = {};
  for (const f of findings) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  console.log(JSON.stringify(bySev, null, 2));
  console.log(`Total findings: ${findings.length}`);
  console.log(`Wrote details to playwright-findings.json and screenshots to ${SHOTS}`);
})().catch(err => {
  console.error('FATAL', err);
  process.exit(1);
});
