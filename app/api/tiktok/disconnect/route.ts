import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Unlink TikTok from the signed-in guest's account. Clears only the
 * tiktok_* columns; a typed social_handle survives, since the guest chose
 * it independently of the link. Display-only; nothing here touches booking,
 * payment or webhook data.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { error } = await svc
    .from('users')
    .update({ tiktok_open_id: null, tiktok_username: null, tiktok_connected_at: null })
    .eq('id', user.id)

  if (error) {
    console.warn('[tiktok] disconnect failed (migration 026 applied?):', error.message)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
