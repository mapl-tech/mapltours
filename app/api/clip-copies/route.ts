import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isClipCopiesJob, planClipCopies, type ClipCopyRow } from '@/lib/clip-copies'

/**
 * Work list for the clip-copies job (lib/clip-copies explains the design).
 *
 * GET, `Authorization: Bearer <GitHub OIDC token>` from the clip-copies
 * workflow on main; anything else is 401.
 *   `?dry=1`      how many clips need copies; mints nothing
 *   `?clip=<id>`  include that clip even if it has copies or a failure marker
 * Answer: each clip's public source URL and signed upload URLs (Supabase's
 * own, valid two hours, overwrite allowed) for its two copies and its
 * failure marker. At most MAX_PER_RUN clips; `more` says how many wait for
 * the next run.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'tour-videos'
const MAX_PER_RUN = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }

type Client = ReturnType<typeof createServiceClient>

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE })

/** Every file already in each folder the copies go to. */
async function storedFiles(svc: Client, folders: string[]): Promise<Set<string>> {
  const stored = new Set<string>()
  await Promise.all(folders.map(async (folder) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await svc.storage.from(BUCKET).list(folder, { limit: 1000, offset })
      if (error) throw new Error(`list ${folder}: ${error.message}`)
      for (const f of data ?? []) stored.add(`${folder}/${f.name}`)
      if (!data || data.length < 1000) break
    }
  }))
  return stored
}

async function signedUpload(svc: Client, path: string): Promise<string> {
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data?.signedUrl) throw new Error(`sign ${path}: ${error?.message ?? 'no url'}`)
  return data.signedUrl
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !(await isClipCopiesJob(token))) return fail(401, 'unauthorized')

  const dry = req.nextUrl.searchParams.get('dry') === '1'
  const clip = req.nextUrl.searchParams.get('clip') ?? ''
  if (clip && !UUID.test(clip)) return fail(400, 'clip must be a clip id')

  try {
    const svc = createServiceClient()
    const { data: rows, error } = await svc
      .from('user_tour_videos')
      .select('id, user_id, status, video_path')
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })
    if (error) throw new Error(`read clips: ${error.message}`)

    const eligible = (rows ?? []) as ClipCopyRow[]
    // With nothing stored every trusted clip is due: that names the folders to read.
    const folders = Array.from(new Set(planClipCopies(eligible, new Set()).map((c) => c.h264.slice(0, c.h264.lastIndexOf('/')))))
    const plan = planClipCopies(eligible, await storedFiles(svc, folders), clip || undefined)
    if (dry) return NextResponse.json({ todo: plan.length }, { headers: NO_STORE })

    const batch = plan.slice(0, MAX_PER_RUN)
    const clips = await Promise.all(batch.map(async (c) => {
      const [hevc, h264, failed] = await Promise.all([signedUpload(svc, c.hevc), signedUpload(svc, c.h264), signedUpload(svc, c.failed)])
      return {
        id: c.id,
        path: c.path,
        source: svc.storage.from(BUCKET).getPublicUrl(c.path).data.publicUrl,
        uploads: { hevc, h264, failed },
      }
    }))
    return NextResponse.json({
      clips,
      more: plan.length - batch.length,
      // The public key the browser already ships; Supabase's gateway expects
      // one on a signed upload, as supabase-js sends it.
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    }, { headers: NO_STORE })
  } catch (e) {
    console.error('[clip-copies]', e instanceof Error ? e.message : e)
    return fail(500, 'could not build the work list')
  }
}
