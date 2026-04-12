import { NextResponse } from 'next/server'

/**
 * Fetches current Jamaica gasoline price from GlobalPetrolPrices.com
 * and converts to JMD/liter using live exchange rates.
 *
 * Caches the result for 6 hours (Petrojam updates biweekly).
 */

let cachedPrice: { jmdPerLiter: number; usdPerLiter: number; fetchedAt: number } | null = null
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

async function fetchJamaicaGasPrice(): Promise<{ jmdPerLiter: number; usdPerLiter: number }> {
  // Check cache
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < CACHE_TTL) {
    return { jmdPerLiter: cachedPrice.jmdPerLiter, usdPerLiter: cachedPrice.usdPerLiter }
  }

  let usdPerLiter = 1.45 // fallback
  let jmdPerLiter = 228  // fallback

  try {
    // GlobalPetrolPrices publishes Jamaica gasoline prices in USD/liter
    const res = await fetch(
      'https://www.globalpetrolprices.com/Jamaica/gasoline_prices/',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MAPLTours/1.0)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (res.ok) {
      const html = await res.text()

      // Extract the USD price from the page
      // The site shows price in USD per liter in a table
      const priceMatch = html.match(/Jamaica<\/a><\/td>\s*<td[^>]*>([\d.]+)<\/td>/)
        || html.match(/id="graphPageLeft"[\s\S]*?([\d]+\.[\d]+)\s*USD/)
        || html.match(/<span[^>]*class="graph-header-values-498"[^>]*>([\d.]+)<\/span>/)

      if (priceMatch) {
        usdPerLiter = parseFloat(priceMatch[1])
      } else {
        // Try to find any reasonable USD price on the page
        const altMatch = html.match(/(\d+\.\d{2,3})\s*(?:USD|U\.S\.\s*Dollar)/i)
        if (altMatch) {
          const parsed = parseFloat(altMatch[1])
          if (parsed > 0.5 && parsed < 5) { // sanity check for price per liter
            usdPerLiter = parsed
          }
        }
      }
    }
  } catch {
    // Scrape failed, try exchange rate approach with known JMD price
  }

  // Get live JMD exchange rate to compute JMD price
  try {
    const fxRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(4000),
    })
    if (fxRes.ok) {
      const fxData = await fxRes.json()
      if (fxData.rates?.JMD) {
        jmdPerLiter = Math.round(usdPerLiter * fxData.rates.JMD)
      }
    }
  } catch {
    // Use fallback JMD rate
    jmdPerLiter = Math.round(usdPerLiter * 157)
  }

  // Update cache
  cachedPrice = { jmdPerLiter, usdPerLiter, fetchedAt: Date.now() }

  return { jmdPerLiter, usdPerLiter }
}

export async function GET() {
  try {
    const price = await fetchJamaicaGasPrice()
    return NextResponse.json({
      jmdPerLiter: price.jmdPerLiter,
      usdPerLiter: Math.round(price.usdPerLiter * 100) / 100,
      currency: 'JMD',
      source: 'GlobalPetrolPrices / Petrojam',
      cachedUntil: cachedPrice ? new Date(cachedPrice.fetchedAt + CACHE_TTL).toISOString() : null,
    })
  } catch {
    return NextResponse.json({
      jmdPerLiter: 228,
      usdPerLiter: 1.45,
      currency: 'JMD',
      source: 'fallback',
      cachedUntil: null,
    })
  }
}
