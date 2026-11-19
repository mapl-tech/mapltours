#!/usr/bin/env node
/**
 * Subscribes https://mapltours.com/api/webhooks/wise to Wise's
 * `transfers#state-change` for the business profile: the go-live step that
 * lets the driver payouts hear when a payment lands or comes back
 * (GO-LIVE.md section 10). Without --yes it only lists the subscriptions.
 *
 *   node scripts/wise-webhook-subscribe.mjs          # list, read-only
 *   node scripts/wise-webhook-subscribe.mjs --yes    # create it
 *
 * Wise documents this endpoint for user tokens; if it refuses the personal
 * token, create the same subscription in Wise's web settings instead (the
 * webhooks page next to API tokens): event "Transfer status change", URL
 * https://mapltours.com/api/webhooks/wise.
 */
import fs from 'node:fs'

function envValue(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const m = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

const token = envValue('WISE_API_TOKEN')
const profileId = Number(envValue('WISE_PROFILE_ID'))
const host = envValue('WISE_ENV') === 'sandbox' ? 'https://api.wise-sandbox.com' : 'https://api.wise.com'
const url = process.env.WEBHOOK_URL || 'https://mapltours.com/api/webhooks/wise'
if (!token || !profileId) {
  console.error('WISE_API_TOKEN and WISE_PROFILE_ID must be set (environment or .env.local)')
  process.exit(1)
}
const call = async (method, path, body) => {
  const r = await fetch(host + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-External-Correlation-Id': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json }
}

const list = await call('GET', `/2026Q4/profiles/${profileId}/subscriptions`)
console.log(`Existing subscriptions: HTTP ${list.status}`)
for (const s of Array.isArray(list.json) ? list.json : []) console.log(`  ${s.id} | ${s.trigger_on} | ${s.delivery?.url}`)
const already = Array.isArray(list.json) && list.json.some((s) => s.trigger_on === 'transfers#state-change' && s.delivery?.url === url)
if (already) {
  console.log('Already subscribed.')
  process.exit(0)
}
if (!process.argv.includes('--yes')) {
  console.log(`\nNot subscribed yet. Run with --yes to subscribe ${url}.`)
  process.exit(0)
}
const made = await call('POST', `/2026Q4/profiles/${profileId}/subscriptions`, {
  name: 'MAPL Tours Jamaica driver payouts',
  trigger_on: 'transfers#state-change',
  delivery: { version: '4.0.0', url },
})
console.log(`Create: HTTP ${made.status}`, made.json?.id ? `subscription ${made.json.id}` : JSON.stringify(made.json).slice(0, 300))
