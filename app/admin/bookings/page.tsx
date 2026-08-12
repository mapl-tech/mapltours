import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Admin bookings + abandoned-cart dashboard.
 *
 * Server component: it confirms the caller is an admin (session cookie ->
 * user -> admins allowlist) BEFORE ever touching the service-role client, so
 * customer PII is never exposed to a non-admin. Read-only; it issues no
 * charges and mutates nothing.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = 'var(--text-tertiary, #8A857D)'
const border = '1px solid var(--border, #E7E1D6)'
const dm = 'var(--font-dm-sans)'

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return '$' + v.toFixed(2)
}
function dateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return '-' }
}
function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function ref(id: string): string { return 'MAPL-' + id.slice(0, 8).toUpperCase() }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm, #F4F1EB)', paddingTop: 56 }}>
      <div className="container" style={{ maxWidth: 1180, padding: '32px 20px 80px', fontFamily: dm, color: ink }}>
        {children}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default async function AdminBookingsPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Bookings</h1>
        <p style={{ marginTop: 10, color: soft }}>
          Please <Link href="/login?redirect=/admin/bookings" style={{ color: ink, fontWeight: 600 }}>sign in</Link> to view this page.
        </p>
      </Shell>
    )
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Not authorised</h1>
        <p style={{ marginTop: 10, color: soft }}>This dashboard is limited to MAPL admins.</p>
      </Shell>
    )
  }

  const { data: bookings } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .order('created_at', { ascending: false })
    .limit(300)

  const all = (bookings ?? []) as Row[]
  const abandoned = all.filter((b) => b.status === 'pending')
  const paid = all.filter((b) => b.status === 'paid')
  const recovered = abandoned.filter((b) => b.recovery_email_sent_at)
  const paidRevenue = paid.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)
  const abandonedValue = abandoned.reduce((s, b) => s + Number(b.total_paid ?? 0), 0)

  const stats = [
    { label: 'Paid bookings', value: String(paid.length), sub: money(paidRevenue) + ' collected' },
    { label: 'Abandoned carts', value: String(abandoned.length), sub: money(abandonedValue) + ' recoverable' },
    { label: 'Recovery emails sent', value: String(recovered.length), sub: 'of ' + abandoned.length + ' abandoned' },
    { label: 'Total bookings', value: String(all.length), sub: 'last 300' },
  ]

  function itemsSummary(b: Row): string {
    const items = (b.booking_items ?? []) as Row[]
    if (!items.length) return '(no items)'
    return items
      .map((i) => (b.booking_type === 'transfer' ? `Transfer to ${i.hotel ?? i.destination}` : i.title))
      .join(', ')
  }

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: dm, fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', margin: 0 }}>Bookings</h1>
        <span style={{ fontSize: 13, color: faint }}>
          <Link href="/admin/videos" style={{ color: soft }}>Video moderation</Link>
        </span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 22 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: '#fff', border, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: faint }}>{s.label}</div>
            <div style={{ fontFamily: dm, fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: soft, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Abandoned carts */}
      <section style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>Abandoned carts</h2>
          <span style={{ fontSize: 12.5, color: faint }}>pending checkouts that were never paid</span>
        </div>
        <p style={{ fontSize: 12.5, color: faint, marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
          A recovery email is sent automatically once a cart is 30 minutes old and still unpaid, then it shows as recovered here. Nothing is ever charged.
        </p>

        <div style={{ overflowX: 'auto', marginTop: 14, border, borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: faint, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Ref</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Started</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Cart</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Value</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Recovery</th>
              </tr>
            </thead>
            <tbody>
              {abandoned.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 22, color: faint, textAlign: 'center' }}>No abandoned carts. 🇯🇲</td></tr>
              )}
              {abandoned.map((b) => (
                <tr key={b.id} style={{ borderTop: border }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {ref(b.id)}
                    <div style={{ fontSize: 11, color: faint, fontWeight: 500, textTransform: 'capitalize' }}>{b.booking_type ?? 'tour'}</div>
                  </td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: soft }}>
                    {ageLabel(b.created_at)}
                    <div style={{ fontSize: 11, color: faint }}>{dateTime(b.created_at)}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{[b.first_name, b.last_name].filter(Boolean).join(' ') || '(no name)'}</div>
                    <div style={{ fontSize: 12, color: soft }}>{b.email || '(no email)'}</div>
                    {b.phone ? <div style={{ fontSize: 12, color: faint }}>{b.phone}</div> : null}
                  </td>
                  <td style={{ padding: '14px 16px', color: soft, maxWidth: 280 }}>{itemsSummary(b)}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(b.total_paid)}</td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                    {b.recovery_email_sent_at ? (
                      <span style={{ color: 'var(--green, #1D7A50)', fontWeight: 600 }}>
                        ✓ Sent
                        <div style={{ fontSize: 11, color: faint, fontWeight: 500 }}>{dateTime(b.recovery_email_sent_at)}</div>
                      </span>
                    ) : (
                      <span style={{ color: faint }}>Queued</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent paid */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontFamily: dm, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>Recent paid bookings</h2>
        <div style={{ overflowX: 'auto', marginTop: 14, border, borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: faint, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Ref</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Paid</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Cart</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Emails</th>
              </tr>
            </thead>
            <tbody>
              {paid.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 22, color: faint, textAlign: 'center' }}>No paid bookings yet.</td></tr>
              )}
              {paid.slice(0, 40).map((b) => (
                <tr key={b.id} style={{ borderTop: border }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{ref(b.id)}</td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: soft }}>{dateTime(b.paid_at ?? b.created_at)}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{[b.first_name, b.last_name].filter(Boolean).join(' ') || '(no name)'}</div>
                    <div style={{ fontSize: 12, color: soft }}>{b.email}</div>
                  </td>
                  <td style={{ padding: '14px 16px', color: soft, maxWidth: 280 }}>{itemsSummary(b)}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(b.total_paid)}</td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: soft, whiteSpace: 'nowrap' }}>
                    {b.confirmation_email_sent_at ? '✓ guest' : '· guest'}{'  '}
                    {b.operator_email_sent_at ? '✓ ops' : '· ops'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  )
}
