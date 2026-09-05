'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTransfersCart } from '@/lib/transfers-cart'
import { useCartStore } from '@/lib/cart'
import { addTourToCart, buildWebMcpTools, registerWebMcpTools, type ModelContextLike } from '@/lib/webmcp-tools'
import { isPaymentInFlight } from '@/lib/payment-lock'
import { markAgentAttribution } from '@/lib/attribution'

/**
 * Registers the site's WebMCP tools with the browser when it has the API
 * (Chrome 149+ behind the origin trial or the WebMCP flag). Renders nothing.
 * Elsewhere `document.modelContext` is undefined and this is a no-op.
 */
export default function WebMcpTools() {
  const router = useRouter()
  useEffect(() => {
    const mc = (document as unknown as { modelContext?: ModelContextLike }).modelContext
    if (!mc || typeof mc.registerTool !== 'function') return
    const ac = new AbortController()
    const tools = buildWebMcpTools({
      origin: window.location.origin,
      addTransferQuote: (quote, opts) => {
        useTransfersCart.getState().addQuote(quote, opts)
        return useTransfersCart.getState().items[0]?.id ?? ''
      },
      updateTransferItem: (id, patch) => useTransfersCart.getState().updateItem(id, patch),
      // The store can refuse or evict; addTourToCart reports which, so the
      // agent never announces a checkout that lacks what was asked for.
      addTour: (exp, guests, date, pickupHotel) => addTourToCart(useCartStore.getState, exp, guests, date, pickupHotel),
      paymentInFlight: isPaymentInFlight,
      onBookingStarted: (tool) => markAgentAttribution(tool),
      navigate: (path) => router.push(path),
    })
    registerWebMcpTools(mc, tools, ac.signal)
    // Chrome 152 rejects the registration promise when the signal aborts
    // (unregister-by-signal lands in 153); the rejection is expected noise.
    return () => ac.abort(new DOMException('WebMcpTools unmounted', 'AbortError'))
  }, [router])
  return null
}
