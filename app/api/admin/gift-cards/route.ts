import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeGiftCode } from '@/lib/gift-cards'
import { sendGiftCardEmails } from '@/lib/email/gift-card'

/**
 * Gift-card support desk.
 *
 * Every other safeguard in this feature assumes someone can intervene when it
 * goes wrong: a mistyped recipient address, an email that bounced, a card sold
 * by mistake. Without this route those are permanent losses, because a gift
 * code lives in a service-role-only table that nothing else can read.
 *
 * Admin-gated the same way as the refund queue: session -> user -> admins
 * allowlist, checked BEFORE the service-role client is touched.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function requireAdmin() {
  const session = createServerSupabase()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }

  return { svc, user }
}

/** Look a card up by code, recipient email, or buyer email. */
export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ cards: [] })

  const COLS = 'id, code, initial_amount, balance, currency, status, purchaser_name, purchaser_email, recipient_name, recipient_email, message, created_at, paid_at, delivered_at, expires_at, stripe_payment_id'

  // Try an exact code first — that is what support will usually be handed.
  const code = normalizeGiftCode(q)
  if (code) {
    const { data } = await svc.from('gift_cards').select(COLS).eq('code', code).maybeSingle()
    if (data) return NextResponse.json({ cards: [data] })
  }

  // Otherwise match either side's email. `ilike` so "JANE@" finds "jane@".
  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const { data } = await svc
    .from('gift_cards')
    .select(COLS)
    .or(`recipient_email.ilike.${pattern},purchaser_email.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ cards: data ?? [] })
}

/**
 * Support actions.
 *
 *   resend          re-deliver the card (clears the delivery claim first)
 *   correct_email   fix a mistyped recipient address, then re-deliver
 *   void            kill a card, e.g. after a chargeback on the purchase
 *   reactivate      undo a void
 */
export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!

  let body: { id?: string; action?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { id, action } = body
  if (!id || !action) return NextResponse.json({ error: 'Missing id or action.' }, { status: 400 })

  const { data: card } = await svc
    .from('gift_cards')
    .select('id, status, balance, recipient_email')
    .eq('id', id)
    .maybeSingle()
  if (!card) return NextResponse.json({ error: 'No such gift card.' }, { status: 404 })

  switch (action) {
    case 'correct_email': {
      const email = (body.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
      }
      // Clearing delivered_at releases the claim so the resend below can take it.
      await svc.from('gift_cards').update({ recipient_email: email, delivered_at: null }).eq('id', id)
      const emails = await sendGiftCardEmails(id)
      return NextResponse.json({ ok: true, recipientEmail: email, emails })
    }

    case 'resend': {
      if (card.status !== 'active') {
        return NextResponse.json(
          { error: 'Only an active card can be delivered. This one is ' + card.status + '.' },
          { status: 409 },
        )
      }
      await svc.from('gift_cards').update({ delivered_at: null }).eq('id', id)
      const emails = await sendGiftCardEmails(id)
      return NextResponse.json({ ok: true, emails })
    }

    case 'void': {
      // Deliberately allowed from any state: the usual reason is a chargeback
      // on the purchase, and the card must stop being spendable immediately.
      const { data: voided } = await svc
        .from('gift_cards')
        .update({ status: 'void' })
        .eq('id', id)
        .neq('status', 'void')
        .select('id')
        .maybeSingle()
      return NextResponse.json({ ok: true, changed: !!voided })
    }

    case 'reactivate': {
      const { data: revived } = await svc
        .from('gift_cards')
        .update({ status: Number(card.balance) > 0 ? 'active' : 'depleted' })
        .eq('id', id)
        .eq('status', 'void')
        .select('id')
        .maybeSingle()
      return NextResponse.json({ ok: true, changed: !!revived })
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
}
