#!/usr/bin/env node
/**
 * Lists the Wise Business account's recipients, read-only, so each payee can
 * be mapped to a recipient id in WISE_PAYOUT_RECIPIENTS (lib/payouts/config.ts).
 *
 *   node scripts/wise-recipients.mjs
 *
 * Reads WISE_API_TOKEN and WISE_PROFILE_ID (and WISE_ENV) from the environment
 * or from .env.local. Prints the recipient id, name, currency, country, type
 * and the last four digits of the account only; never the token or a full
 * account number. GET requests only: nothing is created or changed.
 *
 * Add a payee as a recipient in Wise's own app (Recipients, Add recipient,
 * US dollars: for a US receiving account such as Payoneer's, a bank account in
 * the United States with its routing and account numbers, checking, and the
 * holder's home address; for a foreign bank, its SWIFT code and account
 * number), so bank details never pass through this code. Then run this and
 * copy the id.
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
const host = envValue('WISE_ENV') === 'sandbox' ? 'https://api.wise-sandbox.com' : 'https://api.wise.com'
if (!token) {
  console.error('WISE_API_TOKEN is not set (environment or .env.local)')
  process.exit(1)
}
const get = async (path) => {
  const r = await fetch(host + path, { headers: { Authorization: `Bearer ${token}`, 'X-External-Correlation-Id': crypto.randomUUID() } })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json }
}

let profileId = Number(envValue('WISE_PROFILE_ID'))
if (!profileId) {
  const p = await get('/2026Q4/profiles')
  const biz = Array.isArray(p.json) ? p.json.find((x) => String(x.type).toUpperCase() === 'BUSINESS') : null
  if (!biz) {
    console.error('No business profile found; set WISE_PROFILE_ID')
    process.exit(1)
  }
  profileId = biz.id
  console.log(`Business profile: ${biz.id} (set WISE_PROFILE_ID=${biz.id})`)
}

const res = await get(`/v2/accounts?profileId=${profileId}&size=100`)
if (res.status !== 200) {
  console.error(`Wise answered ${res.status}`)
  process.exit(1)
}
const list = res.json?.content ?? res.json ?? []
if (!list.length) {
  console.log('No recipients yet. Add the payee in Wise (Recipients, Add recipient, US dollars), then run this again.')
  process.exit(0)
}
for (const a of list) {
  const summary = String(a.accountSummary ?? a.longAccountSummary ?? '')
  const last4 = summary.replace(/\D/g, '').slice(-4)
  console.log([
    `id ${a.id}`,
    a.name?.fullName ?? a.accountHolderName ?? '(no name)',
    a.currency,
    a.country ?? '',
    `type ${a.type}`,
    last4 ? `ends ${last4}` : '',
    a.active === false ? 'INACTIVE' : '',
  ].filter(Boolean).join(' | '))
}
console.log('\nThen set WISE_PAYOUT_RECIPIENTS to the names exactly as bookings store them, every name paid to one account on its id, for example:')
console.log('  WISE_PAYOUT_RECIPIENTS={"Collin": <his id>}   and   WISE_TOUR_PAYEE=Collin')
