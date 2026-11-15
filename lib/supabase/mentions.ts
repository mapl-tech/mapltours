'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from './client'
import { useAuth } from './auth-context'
import { guestLabel } from '@/lib/social-handle'
import { experiences, slugify } from '@/lib/experiences'
import { extractMentionIds, type MentionPerson } from '@/lib/mentions'

/**
 * The tagged guest's side of @mentions: the unread count on the nav avatar,
 * the Mentions list on the profile, marking read, and the email switch.
 *
 * Everything reads comment_mentions under its row-level security (a guest
 * sees only rows where they are the one tagged). Before migration 039 exists
 * in an environment every query here fails, and every hook answers "nothing"
 * rather than an error: a missing feature, never a broken page.
 */

const supabase = createClient()

/** Fired after anything changes read state, so every badge re-counts at once. */
export const MENTIONS_CHANGED = 'mapl:mentions-changed'
const announce = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MENTIONS_CHANGED))
}

const POLL_MS = 120_000

/** Unread mentions for the signed-in guest; 0 when signed out. */
export function useUnreadMentionCount(): number {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const userId = user?.id ?? null

  const load = useCallback(async () => {
    if (!userId) { setCount(0); return }
    const { count: n, error } = await supabase
      .from('comment_mentions')
      .select('id', { count: 'exact', head: true })
      .eq('mentioned_user_id', userId)
      .is('read_at', null)
    setCount(error ? 0 : n ?? 0)
  }, [userId])

  useEffect(() => {
    void load()
    if (!userId) return
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    window.addEventListener(MENTIONS_CHANGED, load)
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(MENTIONS_CHANGED, load)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, userId])

  return count
}

export interface MyMention {
  id: string
  commentId: string
  createdAt: string
  read: boolean
  author: MentionPerson & { avatarUrl: string | null }
  /** The comment text with its tokens; render with MentionText. */
  text: string
  tourTitle: string
  href: string
}

export interface MyMentionsState {
  items: MyMention[]
  /** Labels for every tag in those comments. */
  people: Map<string, MentionPerson>
  unread: number
  loading: boolean
  failed: boolean
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  reload: () => void
}

type MentionRow = { id: string; comment_id: string; experience_id: number; author_id: string; created_at: string; read_at: string | null }
type CommentRow = { id: string; text: string }
type UserRow = { id: string; name: string | null; avatar_url: string | null; social_handle?: string | null }

const LIST_LIMIT = 30

export function useMyMentions(): MyMentionsState {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<MyMention[]>([])
  const [people, setPeople] = useState<Map<string, MentionPerson>>(new Map())
  // Whose list is on screen. Loading until it is this guest's: before sign-in
  // has settled there is no answer yet, not an empty one.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Set on every mount, not only the first: React may mount, unmount and
  // mount again (Strict Mode, Fast Refresh), and a flag left false would
  // drop every answer after that.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!userId) { setItems([]); return }
    const { data: rows, error } = await supabase
      .from('comment_mentions')
      .select('id, comment_id, experience_id, author_id, created_at, read_at')
      .eq('mentioned_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)
    if (alive.current) setFailed(false)
    if (error) {
      // 42P01: the table is not there yet (migration 039 not applied). Show nothing, not an error.
      if (alive.current) { setItems([]); setFailed(error.code !== '42P01' && !/comment_mentions/.test(error.message ?? '')); setLoadedFor(userId); setReloading(false) }
      return
    }
    const mentionRows = (rows ?? []) as MentionRow[]
    const commentIds = mentionRows.map((r) => r.comment_id)
    const { data: comments } = commentIds.length
      ? await supabase.from('comments').select('id, text').in('id', commentIds)
      : { data: [] as CommentRow[] }
    const textById = new Map(((comments ?? []) as CommentRow[]).map((c) => [c.id, c.text]))
    const ids = new Set<string>()
    for (const r of mentionRows) ids.add(r.author_id)
    textById.forEach((t) => { for (const id of extractMentionIds(t)) ids.add(id) })
    let userRows: UserRow[] = []
    if (ids.size) {
      const full = await supabase.from('users').select('id, name, avatar_url, social_handle').in('id', Array.from(ids))
      const res = full.error ? await supabase.from('users').select('id, name, avatar_url').in('id', Array.from(ids)) : full
      userRows = (res.data ?? []) as UserRow[]
    }
    const peopleMap = new Map<string, MentionPerson>()
    const avatar = new Map<string, string | null>()
    for (const u of userRows) {
      const l = guestLabel(u.social_handle ?? null, u.name, '')
      if (l.text) peopleMap.set(u.id, { label: l.text, isHandle: l.isHandle })
      avatar.set(u.id, u.avatar_url || null)
    }
    const list: MyMention[] = mentionRows
      .filter((r) => textById.has(r.comment_id))
      .map((r) => {
        const exp = experiences.find((e) => e.id === r.experience_id)
        const slug = exp ? slugify(exp.title) : null
        const who = peopleMap.get(r.author_id)
        return {
          id: r.id,
          commentId: r.comment_id,
          createdAt: r.created_at,
          read: !!r.read_at,
          author: { label: who?.label ?? 'A guest', isHandle: who?.isHandle ?? false, avatarUrl: avatar.get(r.author_id) ?? null },
          text: textById.get(r.comment_id) ?? '',
          tourTitle: exp?.title ?? 'a tour',
          href: slug ? `/experience/${slug}?comment=${r.comment_id}` : '/explore',
        }
      })
    if (!alive.current) return
    setItems(list)
    setPeople(peopleMap)
    setFailed(false)
    setLoadedFor(userId)
    setReloading(false)
  }, [userId])

  useEffect(() => {
    void load()
    const reload = () => void load()
    window.addEventListener(MENTIONS_CHANGED, reload)
    return () => window.removeEventListener(MENTIONS_CHANGED, reload)
  }, [load])

  const markRead = useCallback(async (ids: string[]) => {
    if (!userId || !ids.length) return
    setItems((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, read: true } : m)))
    await supabase.from('comment_mentions').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)
    announce()
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    setItems((prev) => prev.map((m) => ({ ...m, read: true })))
    await supabase
      .from('comment_mentions')
      .update({ read_at: new Date().toISOString() })
      .eq('mentioned_user_id', userId)
      .is('read_at', null)
    announce()
  }, [userId])

  const reload = useCallback(() => { setReloading(true); void load() }, [load])
  const loading = !userId || loadedFor !== userId || reloading

  return { items, people, unread: items.filter((m) => !m.read).length, loading, failed, markRead, markAllRead, reload }
}

/**
 * Whether a comment is still on a tour: true, false (deleted, or not this
 * tour's), or null when the question could not be asked. Comments are public,
 * so this needs no sign-in.
 */
export async function commentStillThere(experienceId: number, commentId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('comments')
    .select('id')
    .eq('id', commentId)
    .eq('experience_id', experienceId)
    .maybeSingle()
  if (error) return null
  return !!data
}

/** Marks the signed-in guest's mention in one comment read (landing from an email or the profile). */
export async function markCommentMentionRead(userId: string, commentId: string): Promise<void> {
  const { error } = await supabase
    .from('comment_mentions')
    .update({ read_at: new Date().toISOString() })
    .eq('mentioned_user_id', userId)
    .eq('comment_id', commentId)
    .is('read_at', null)
  if (!error) announce()
}

/** The "email me when someone tags me" switch. On unless the guest turned it off. */
export function useMentionEmailPref(): { on: boolean; ready: boolean; saving: boolean; failed: boolean; set: (on: boolean) => Promise<void> } {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [on, setOn] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    if (!userId) { setReady(false); return }
    void supabase
      .from('notification_prefs')
      .select('mention_emails')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        if (error) { setReady(false); return }
        setOn(data ? data.mention_emails !== false : true)
        setReady(true)
      })
    return () => { live = false }
  }, [userId])

  const set = useCallback(async (next: boolean) => {
    if (!userId) return
    const before = on
    setOn(next)
    setSaving(true)
    setFailed(false)
    const { error } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: userId, mention_emails: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { setOn(before); setFailed(true) }
  }, [userId, on])

  return { on, ready, saving, failed, set }
}
