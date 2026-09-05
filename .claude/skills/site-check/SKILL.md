---
name: site-check
description: Check a mapltours.com route (or the whole money path) the way a guest sees it, on a phone first, using the project's browser MCPs. Use after any UI change, before a deploy, or when asked "does X look right". Takes an optional route or URL; defaults to the transfers flow.
---

# Site check

Delegate this to the `browser` agent (Agent tool, `subagent_type: browser`) so the screenshots and tool calls stay out of the main context; it has the same servers and the same rules. Look at the page, do not infer it. Use `playwright-mobile` first, then `playwright`. Screenshots go to `.playwright-mcp/` (gitignored). Analytics origins are blocked in these browsers, so browsing never pollutes GA4.

## Inputs
`$ARGUMENTS` is a route (`/transfers`), a full URL (a Netlify deploy preview, `http://localhost:3100/...`), or empty. Empty means the transfers money path on production.

## Routine (per viewport: iPhone 13, then 1440 desktop)
1. `browser_navigate` to the target. Wait for network idle. `browser_console_messages` with level `error`; any error is a finding.
2. `browser_take_screenshot` of the first view. Read the image. Check: nothing clipped or overflowing, no horizontal scroll (`browser_evaluate`: `document.documentElement.scrollWidth <= innerWidth`), the primary CTA visible without scrolling, prices show their unit ("per vehicle", "up to N").
3. `browser_snapshot` (accessibility tree). Every input has a name, every icon-only button has a label, tab order follows the visual order.
4. Money path (when the route is `/transfers`, `/explore`, or an experience page):
   - Transfers: Pickup shows the airport; type a hotel into Drop-off; pick it; a price appears; tap Book; the checkout shows the route and the same price. Fill the details with `Alex Morgan / alex.morgan@example.com`. **Stop before "Continue to payment" on production.**
   - Tours: open a tour, Add to Trip, tap Checkout, fill details, tick the waiver. Stop before the payment step on production.
5. Measure what matters: tap targets ≥ 44px on the controls you touched (`browser_evaluate` with `getBoundingClientRect`), text contrast on new copy (compute the ratio, do not estimate), and for a performance question switch to `chrome-devtools`: `emulate` a mobile CPU/network profile, `performance_start_trace`, load the page, `performance_stop_trace`, report LCP, CLS and the largest requests.
6. Report as findings, each with the screenshot filename and the measurement. Say what was not checked.

## Rules
- Production is read-only. Anything that would create a booking runs against a local dev server with an `@example.com` email, then `node scripts/purge-test-bookings.mjs --commit` (dry-run first).
- Check 390 and 1440 for every UI change. A change is not done until both are seen.
- Never remove the tracker blocks from `.mcp.json`.
