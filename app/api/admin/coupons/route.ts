import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateCouponCode, normalizeCouponCode, normalizeEmail, type CouponRow } from '@/lib/coupons'
import { parseCouponFields } from '@/lib/coupon-admin'

/**
 * Coupon desk.
 *
 * Admin-gated the same way as the gift-card desk: session -> user -> admins
 * allowlist, checked BEFORE the service-role client is touched.
 *
 *   GET   ?q=&status=        list, newest first, with each code's redemptions
 *   POST  { ...fields }      create one (the only place a word code is born)
 *   PATCH { id, action }     pause | resume | void
 *   PATCH { id, action: 'update', ...fields }   change a live code's rules
 *
 * Nothing here can create an invalid coupon: kind, value, uses, dates and
 * the email binding are validated before the insert, and the row's own
 * CHECK constraints back that up.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COLS = 'id, code, kind, value, applies_to, email, max_uses, uses, uses_per_email, min_total, starts_at, expires_at, status, source, note, created_at, updated_at'

async function requireAdmin() {
  const session = createServerSupabase()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { svc, user }
}

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const status = (url.searchParams.get('status') ?? '').trim()

  let query = svc.from('coupons').select(COLS).order('created_at', { ascending: false }).limit(200)
  if (status === 'active' || status === 'paused' || status === 'void') query = query.eq('status', status)
  if (q) {
    const code = normalizeCouponCode(q)
    // A comma or bracket is structural inside or(...); % and _ are wildcards.
    // Stripped, not escaped: none of them belongs in a code or email search.
    const pattern = `%${q.replace(/[%_,()\\]/g, '')}%`
    query = code
      ? query.or(`code.eq.${code},email.ilike.${pattern},note.ilike.${pattern}`)
      : query.or(`email.ilike.${pattern},note.ilike.${pattern}`)
  }
  const { data: coupons, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (coupons ?? []).map((c) => c.id)
  const { data: redemptions } = ids.length
    ? await svc.from('coupon_redemptions').select('coupon_id, booking_id, email, amount, created_at').in('coupon_id', ids).order('created_at', { ascending: false })
    : { data: [] as { coupon_id: string; booking_id: string | null; email: string | null; amount: number | string; created_at: string }[] }

  return NextResponse.json({ coupons: coupons ?? [], redemptions: redemptions ?? [] })
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const parsed = parseCouponFields(b)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const f = parsed.fields

  const emailRaw = typeof b.email === 'string' ? normalizeEmail(b.email) : ''
  if (emailRaw && !EMAIL_RE.test(emailRaw)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })

  let code: string | null = null
  if (typeof b.code === 'string' && b.code.trim()) {
    code = normalizeCouponCode(b.code)
    if (!code) return NextResponse.json({ error: 'A code is 4 to 24 letters and digits.' }, { status: 400 })
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const tryCode = code ?? generateCouponCode()
    const { data, error } = await svc
      .from('coupons')
      .insert({ code: tryCode, ...f, email: emailRaw || null, status: 'active', source: 'admin', created_by: gate.user!.id })
      .select(COLS)
      .single<CouponRow>()
    if (!error && data) return NextResponse.json({ coupon: data })
    if (error?.code === '23505') {
      if (code) return NextResponse.json({ error: `${code} already exists.` }, { status: 409 })
      continue
    }
    return NextResponse.json({ error: error?.message ?? 'Could not create the coupon.' }, { status: 500 })
  }
  return NextResponse.json({ error: 'Could not create the coupon.' }, { status: 500 })
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const svc = gate.svc!

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const id = typeof b.id === 'string' ? b.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown coupon.' }, { status: 400 })

  // Editing a live code's rules. The code itself and its status are not
  // editable here (a code is an identity; pause/resume/void move status),
  // and a void code stays void.
  if (b.action === 'update') {
    const parsed = parseCouponFields(b)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const emailRaw = typeof b.email === 'string' ? normalizeEmail(b.email) : ''
    if (emailRaw && !EMAIL_RE.test(emailRaw)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
    const { data, error } = await svc
      .from('coupons')
      .update({ ...parsed.fields, email: emailRaw || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .neq('status', 'void')
      .select(COLS)
      .maybeSingle<CouponRow>()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'That coupon is void or does not exist.' }, { status: 404 })
    return NextResponse.json({ ok: true, coupon: data })
  }

  const next = b.action === 'pause' ? 'paused' : b.action === 'resume' ? 'active' : b.action === 'void' ? 'void' : null
  if (!next) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  // Conditional and idempotent: a void is final, a pause/resume only moves
  // between the two live states.
  let q = svc.from('coupons').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
  q = next === 'void' ? q.neq('status', 'void') : q.in('status', ['active', 'paused']).neq('status', next)
  const { data, error } = await q.select('id, status').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, changed: !!data })
}
