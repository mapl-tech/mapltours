import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { isUuid } from '@/lib/mentions'
import { processMentionEmails } from '@/lib/mentions-server'

/**
 * Emails the people tagged in a comment the caller just posted.
 *
 *   POST /api/mentions/notify   { "commentId": "<uuid>" }
 *
 * Only the comment's own author may ask, and only that comment's pending
 * mentions are claimed, so the call cannot be used to mail anyone else. It is
 * idempotent: a second call finds nothing pending. Whatever this call misses
 * (the tab closed first, a timeout) the ten-minute sweep sends.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (rateLimit(`${getIp(req)}:${user.id}`, { bucket: 'mention-notify', max: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 })
  }

  let commentId: unknown = null
  try {
    commentId = ((await req.json()) as { commentId?: unknown })?.commentId
  } catch {
    commentId = null
  }
  if (!isUuid(commentId)) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

  const svc = createServiceClient()
  const { data: comment } = await svc.from('comments').select('id, user_id').eq('id', commentId).maybeSingle()
  if (!comment || comment.user_id !== user.id) {
    return NextResponse.json({ error: 'not your comment' }, { status: 404 })
  }

  const result = await processMentionEmails(svc, { commentId: commentId.toLowerCase(), limit: 10 })
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
}
