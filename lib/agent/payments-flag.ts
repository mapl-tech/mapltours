/**
 * Whether the connector lists book_and_pay_transfer at all: AGENT_PAYMENTS_ENABLED
 * exactly "1" and a Stripe key. Its own module, free of Stripe and Supabase, so
 * the public pages that describe the connector (/connect, llms.txt) say what the
 * server really offers. Those pages are built static, so they read it at build
 * time from the same deploy the /mcp function runs in.
 */
export function agentPaymentsEnabled(): boolean {
  return process.env.AGENT_PAYMENTS_ENABLED === '1' && !!process.env.STRIPE_SECRET_KEY
}
