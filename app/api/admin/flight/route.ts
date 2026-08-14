import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeFlight, type FlightStatus } from '@/lib/flight'

/**
 * Authoritative flight status for the dispatch console. Admin-gated, read-only,
 * airline-agnostic: it looks a flight up by IATA number + date through
 * AeroDataBox (RapidAPI). If no provider key is configured it returns
 * { configured: false } and the console falls back to the universal deep links.
 *
 * Set AERODATABOX_API_KEY (a RapidAPI key for the AeroDataBox API) to enable.
 */

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leg(node: any): FlightStatus['departure'] {
  if (!node) return null
  const fmt = (t: { local?: string } | undefined) => {
    // AeroDataBox local format: "2026-08-15 21:05-05:00" -> "Sat, Aug 15, 9:05 PM"
    if (!t?.local) return null
    const m = t.local.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})/)
    if (!m) return t.local
    const [, y, mo, d, hh, mm] = m
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm))
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  }
  return {
    airport: node.airport?.iata ?? node.airport?.name ?? null,
    scheduledLocal: fmt(node.scheduledTime),
    revisedLocal: fmt(node.revisedTime),
  }
}

export async function GET(request: NextRequest) {
  // Auth: admin only.
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const rawFlight = url.searchParams.get('flight')
  const date = url.searchParams.get('date') // YYYY-MM-DD
  const { iata } = normalizeFlight(rawFlight)

  const key = process.env.AERODATABOX_API_KEY
  const base: FlightStatus = {
    configured: !!key,
    resolvable: !!iata,
    found: false,
    ident: iata,
    status: null,
    departure: null,
    arrival: null,
  }

  if (!key) return NextResponse.json(base)
  if (!iata) return NextResponse.json({ ...base, error: 'flight_number_incomplete' })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ...base, error: 'bad_date' })

  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(iata)}/${date}?withAircraftImage=false&withLocation=false`,
      { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } },
    )
    if (res.status === 404) return NextResponse.json({ ...base, found: false })
    if (!res.ok) return NextResponse.json({ ...base, error: `provider_${res.status}` })
    const data = await res.json()
    const flights = Array.isArray(data) ? data : data?.flights ?? []
    const f = flights[0]
    if (!f) return NextResponse.json({ ...base, found: false })
    return NextResponse.json({
      ...base,
      found: true,
      status: f.status ?? null,
      departure: leg(f.departure),
      arrival: leg(f.arrival),
    } satisfies FlightStatus)
  } catch {
    return NextResponse.json({ ...base, error: 'provider_unreachable' })
  }
}
