import { parseKey } from '../bible/refs'
import type { LessonRecord, VerseReview, VerseState } from '../types'

/** Побеждает более новая версия записи. Нет локальной записи — берём облачную. При равенстве остаётся локальная. */
export function remoteWins(local: { updatedAt: number } | undefined, remoteUpdatedAt: number): boolean {
  return !local || remoteUpdatedAt > local.updatedAt
}

/** Самое позднее серверное время среди строк (мс) */
export function maxServerTime(rows: { server_updated_at?: string }[], current: number | null): number | null {
  let max = current
  for (const r of rows) {
    if (!r.server_updated_at) continue
    const t = Date.parse(r.server_updated_at)
    if (Number.isFinite(t) && (max === null || t > max)) max = t
  }
  return max
}

/**
 * С какого момента запрашивать изменения. Берём с запасом назад: транзакции на сервере могут завершаться
 * не в порядке начала, и запись с чуть более ранним временем появится позже. Повторная обработка безопасна.
 */
export const OVERLAP_MS = 5 * 60 * 1000
export function sinceIso(cursor: number | null): string {
  return new Date(cursor === null ? 0 : Math.max(0, cursor - OVERLAP_MS)).toISOString()
}

/** Строка таблицы verses в облаке */
export interface VerseRow {
  user_id?: string
  key: string
  translation: string
  book: string
  chapter: number
  verse: number
  added_at: number
  strength: number
  stage?: number
  next_review_at: number
  last_up_at: number | null
  last_practiced_at: number | null
  last_score: number | null
  lapses: number
  updated_at: number
  deleted_at: number | null
  server_updated_at?: string
}

/** Строка таблицы reviews в облаке */
export interface ReviewRow {
  user_id?: string
  uid: string
  verse_key: string
  exercise: string
  tier: number
  score: number
  xp: number
  created_at: number
  server_updated_at?: string
}

export function verseToRow(v: VerseState, userId: string): VerseRow {
  return {
    user_id: userId,
    key: v.key,
    translation: v.translation,
    book: v.book,
    chapter: v.chapter,
    verse: v.verse,
    added_at: v.addedAt,
    strength: v.strength,
    stage: v.stage,
    next_review_at: v.nextReviewAt,
    last_up_at: v.lastUpAt,
    last_practiced_at: v.lastPracticedAt,
    last_score: v.lastScore,
    lapses: v.lapses,
    updated_at: v.updatedAt,
    deleted_at: v.deletedAt ?? null,
  }
}

const orNull = (x: number | null): number | null => (x === null || x === undefined ? null : Number(x))

export function rowToVerse(r: VerseRow): VerseState {
  return {
    key: r.key,
    translation: r.translation,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
    addedAt: Number(r.added_at),
    strength: r.strength,
    // Строки, записанные до появления стадии, имеют стадию 0 при ненулевой силе: расписание тогда считалось по силе
    stage: r.stage && r.stage > 0 ? r.stage : r.strength,
    nextReviewAt: Number(r.next_review_at),
    lastUpAt: orNull(r.last_up_at),
    lastPracticedAt: orNull(r.last_practiced_at),
    lastScore: orNull(r.last_score),
    lapses: r.lapses,
    updatedAt: Number(r.updated_at),
    deletedAt: orNull(r.deleted_at),
    dirty: 0,
  }
}

/** Стих с ключом, который эта версия не понимает, пропускается */
export const isKnownVerseRow = (r: VerseRow): boolean => parseKey(r.key) !== null

export function reviewToRow(v: VerseReview, userId: string): ReviewRow {
  return {
    user_id: userId,
    uid: v.uid,
    verse_key: v.verseKey,
    exercise: v.exercise,
    tier: v.tier,
    score: v.score,
    xp: v.xp,
    created_at: v.createdAt,
  }
}

export function rowToReview(r: ReviewRow): VerseReview {
  return {
    uid: r.uid,
    verseKey: r.verse_key,
    exercise: r.exercise,
    tier: r.tier as 1 | 2 | 3,
    score: r.score,
    xp: r.xp,
    createdAt: Number(r.created_at),
    dirty: 0,
  }
}

/** Строка таблицы lessons в облаке. Столбцы type и status остались от прежней версии и всегда заполняются одинаково. */
export interface LessonRow {
  user_id?: string
  uid: string
  type: string
  status: string
  verse_keys: string[]
  xp: number
  mistakes: number
  created_at: number
  server_updated_at?: string
}

export function lessonToRow(l: LessonRecord, userId: string): LessonRow {
  return {
    user_id: userId,
    uid: l.uid,
    type: 'regular',
    status: 'done',
    verse_keys: l.verseKeys,
    xp: l.xp,
    mistakes: l.mistakes,
    created_at: l.createdAt,
  }
}

/** Пропускаем уроки без стихов (так выглядели «пропущенные» уроки прежней версии) */
export const isKnownLessonRow = (r: LessonRow): boolean => Array.isArray(r.verse_keys) && r.verse_keys.length > 0

export function rowToLesson(r: LessonRow): LessonRecord {
  return {
    uid: r.uid,
    verseKeys: r.verse_keys,
    xp: r.xp,
    mistakes: r.mistakes,
    createdAt: Number(r.created_at),
    dirty: 0,
  }
}
