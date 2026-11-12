import { db, markSyncTx } from '../db/db'
import { supabase } from './client'
import {
  isKnownLessonRow, isKnownVerseRow, lessonToRow, maxServerTime, remoteWins, reviewToRow, rowToLesson, rowToReview,
  rowToVerse, sinceIso, verseToRow,
  type LessonRow, type ReviewRow, type VerseRow,
} from './mapping'
import { getPullCursor, setPullCursor } from './syncMeta'

const PAGE = 500
const CHUNK = 200

export interface SyncSummary {
  pulled: number
  pushed: number
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

/** Столбец, по которому однозначно упорядочиваются записи с одинаковым временем: у стихов это key, у остальных uid */
const ORDER_COLUMN = { verses: 'key', reviews: 'uid', lessons: 'uid' } as const

/** Забирает все записи таблицы, изменённые после `since`, страницами */
async function fetchChanged<T>(table: keyof typeof ORDER_COLUMN, since: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gt('server_updated_at', since)
      .order('server_updated_at', { ascending: true })
      .order(ORDER_COLUMN[table], { ascending: true })
      .range(from, from + PAGE - 1)
    fail(error)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function chunks<T>(list: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size))
  return result
}

/**
 * Один цикл синхронизации: сначала забираем изменения из облака, затем отправляем локальные.
 * Стихи сливаются по правилу «побеждает более новая запись» (updatedAt); журнал результатов и история уроков только добавляются.
 */
export async function syncOnce(userId: string): Promise<SyncSummary> {
  if (!supabase) throw new Error('Облако не настроено')
  const summary: SyncSummary = { pulled: 0, pushed: 0 }

  // ---------- 1. Забираем ----------
  const cursor = getPullCursor(userId)
  const since = sinceIso(cursor)
  const verseRows = await fetchChanged<VerseRow>('verses', since)
  const reviewRows = await fetchChanged<ReviewRow>('reviews', since)
  const lessonRows = await fetchChanged<LessonRow>('lessons', since)

  await db.transaction('rw', db.verses, db.reviews, db.lessons, async (tx) => {
    markSyncTx(tx)

    for (const r of verseRows) {
      if (!isKnownVerseRow(r)) continue
      const local = await db.verses.get(r.key)
      if (!remoteWins(local, Number(r.updated_at))) continue
      if (r.deleted_at !== null) {
        if (local) {
          await db.verses.delete(r.key)
          summary.pulled++
        }
        continue
      }
      await db.verses.put(rowToVerse(r))
      summary.pulled++
    }

    for (const r of reviewRows) {
      if ((await db.reviews.where('uid').equals(r.uid).count()) > 0) continue
      await db.reviews.add(rowToReview(r))
      summary.pulled++
    }

    for (const r of lessonRows) {
      if (!isKnownLessonRow(r)) continue
      if ((await db.lessons.where('uid').equals(r.uid).count()) > 0) continue
      await db.lessons.add(rowToLesson(r))
      summary.pulled++
    }
  })

  // ---------- 2. Отправляем ----------
  const dirtyVerses = await db.verses.where('dirty').equals(1).toArray()
  for (const part of chunks(dirtyVerses, CHUNK)) {
    const { error } = await supabase
      .from('verses')
      .upsert(part.map((v) => verseToRow(v, userId)), { onConflict: 'user_id,key' })
    fail(error)
  }

  const dirtyReviews = await db.reviews.where('dirty').equals(1).toArray()
  for (const part of chunks(dirtyReviews, CHUNK)) {
    const { error } = await supabase
      .from('reviews')
      .upsert(part.map((r) => reviewToRow(r, userId)), { onConflict: 'user_id,uid', ignoreDuplicates: true })
    fail(error)
  }

  const dirtyLessons = await db.lessons.where('dirty').equals(1).toArray()
  for (const part of chunks(dirtyLessons, CHUNK)) {
    const { error } = await supabase
      .from('lessons')
      .upsert(part.map((l) => lessonToRow(l, userId)), { onConflict: 'user_id,uid', ignoreDuplicates: true })
    fail(error)
  }

  // Снимаем пометки. Если запись успели изменить во время отправки, она остаётся «грязной» до следующего раза.
  await db.transaction('rw', db.verses, db.reviews, db.lessons, async (tx) => {
    markSyncTx(tx)
    for (const v of dirtyVerses) {
      const cur = await db.verses.get(v.key)
      if (!cur || cur.updatedAt !== v.updatedAt) continue
      if (cur.deletedAt) await db.verses.delete(cur.key)
      else await db.verses.update(cur.key, { dirty: 0 })
    }
    for (const r of dirtyReviews) await db.reviews.update(r.id!, { dirty: 0 })
    for (const l of dirtyLessons) await db.lessons.update(l.id!, { dirty: 0 })
  })
  summary.pushed = dirtyVerses.length + dirtyReviews.length + dirtyLessons.length

  setPullCursor(userId, maxServerTime([...verseRows, ...reviewRows, ...lessonRows], cursor))
  return summary
}
