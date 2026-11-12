import Dexie, { type Table, type Transaction } from 'dexie'
import { uuid } from '../lib/uuid'
import { getSyncUserId } from '../sync/syncMeta'
import type { VerseRef } from '../bible/types'
import { parseKey, TRANSLATION, verseKey } from '../bible/refs'
import { applyVerseResult, xpFor, type Tier } from '../logic/mastery'
import type { GapCacheRow, LessonRecord, VerseReview, VerseState } from '../types'

class AppDB extends Dexie {
  verses!: Table<VerseState, string>
  reviews!: Table<VerseReview, number>
  lessons!: Table<LessonRecord, number>
  gapOptions!: Table<GapCacheRow, string>

  constructor() {
    super('memorize-by-heart')
    this.version(1).stores({
      texts: '++id, nextReviewAt',
      attempts: '++id, textId, createdAt',
    })
    // v2: глобальные id для синхронизации и пометка «не отправлено в облако»
    this.version(2)
      .stores({
        texts: '++id, uid, nextReviewAt, dirty',
        attempts: '++id, uid, textId, textUid, createdAt, dirty',
      })
      .upgrade(async (tx) => {
        const uidById = new Map<number, string>()
        const now = Date.now()
        await tx.table('texts').toCollection().modify((t: Record<string, unknown>) => {
          const uid = uuid()
          uidById.set(t.id as number, uid)
          t.uid = uid
          t.updatedAt = now
          t.dirty = 1
        })
        await tx.table('attempts').toCollection().modify((a: Record<string, unknown>, ctx: { value?: unknown }) => {
          const textUid = uidById.get(a.textId as number)
          if (!textUid) {
            delete ctx.value // попытка без текста — удаляем
            return
          }
          a.uid = uuid()
          a.textUid = textUid
          a.dirty = 1
        })
      })
    // v3: стихи Библии, которые пользователь учит
    this.version(3).stores({
      verses: 'key, book, nextReviewAt, dirty',
    })
    // v4: журнал результатов по стихам и поля прогресса у стихов
    this.version(4)
      .stores({
        verses: 'key, book, nextReviewAt, dirty',
        reviews: '++id, uid, verseKey, createdAt, dirty',
      })
      .upgrade((tx) =>
        tx.table('verses').toCollection().modify((v: Record<string, unknown>) => {
          v.lastUpAt ??= null
          v.lastPracticedAt ??= null
          v.lastScore ??= null
          v.lapses ??= 0
        }),
      )
    // v5: история уроков
    this.version(5).stores({
      lessons: '++id, uid, createdAt, dirty',
    })
    // v6: стадия повторения отделена от силы; у существующих стихов стадия равна прежней силе (так считались интервалы)
    this.version(6)
      .stores({})
      .upgrade((tx) =>
        tx.table('verses').toCollection().modify((v: Record<string, unknown>) => {
          if (typeof v.stage !== 'number') v.stage = typeof v.strength === 'number' ? v.strength : 0
        }),
      )
    // v7: режим «свои тексты» убран из приложения, его таблицы удаляются
    this.version(7).stores({ texts: null, attempts: null })
    // v8: варианты ответов от ИИ, сохранённые на устройстве (кэш; в облако не синхронизируется)
    this.version(8).stores({ gapOptions: 'id' })
  }
}

export const db = new AppDB()

// ---------- Пометки для синхронизации ----------

/** Транзакции синхронизации помечаются, чтобы их запись не считалась «локальным изменением» */
export function markSyncTx(tx: Transaction) {
  ;(tx as unknown as { sync?: boolean }).sync = true
}
const isSyncTx = (tx: Transaction | undefined) => !!tx && !!(tx as unknown as { sync?: boolean }).sync

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('memo:changed'))
}

db.verses.hook('creating', (_key, obj, tx) => {
  if (isSyncTx(tx)) return
  obj.updatedAt = Date.now()
  obj.dirty = 1
  notifyChanged()
})
db.verses.hook('updating', (_mods, _key, _obj, tx) => {
  if (isSyncTx(tx)) return
  notifyChanged()
  return { updatedAt: Date.now(), dirty: 1 }
})

db.reviews.hook('creating', (_key, obj, tx) => {
  if (isSyncTx(tx)) return
  obj.uid ||= uuid()
  obj.dirty = 1
  notifyChanged()
})

db.lessons.hook('creating', (_key, obj, tx) => {
  if (isSyncTx(tx)) return
  obj.uid ||= uuid()
  obj.dirty = 1
  notifyChanged()
})

// ---------- Запросы ----------

export const countLiveVerses = () => db.verses.filter((v) => !v.deletedAt).count()

async function removeEverythingInTx() {
  if (getSyncUserId()) {
    // Для синхронизируемого устройства стихи остаются с пометкой удаления, чтобы она дошла до облака и других устройств
    const now = Date.now()
    await db.verses.filter((v) => !v.deletedAt).modify({ deletedAt: now })
  } else {
    await db.verses.clear()
    await db.reviews.clear()
  }
  await db.lessons.clear()
}

/** Удалить все данные. Для синхронизируемого устройства удаление дойдёт и до облака. */
export async function clearAll() {
  await db.transaction('rw', db.verses, db.reviews, db.lessons, removeEverythingInTx)
}

/** Стереть всё локально, не затрагивая облако (при смене аккаунта на устройстве) */
export async function wipeLocal() {
  await db.transaction('rw', db.verses, db.reviews, db.lessons, db.gapOptions, async () => {
    await db.verses.clear()
    await db.reviews.clear()
    await db.lessons.clear()
    await db.gapOptions.clear()
  })
}

// ---------- Стихи ----------

export const liveVerses = () => db.verses.filter((v) => !v.deletedAt).toArray()

/**
 * Добавляет стихи в список изучаемых. Уже добавленные пропускаются,
 * ранее удалённые возвращаются в список. Возвращает, сколько стихов добавлено.
 */
export async function addVerses(refs: VerseRef[], translation = TRANSLATION): Promise<number> {
  let added = 0
  await db.transaction('rw', db.verses, async () => {
    const now = Date.now()
    for (const ref of refs) {
      const key = verseKey(translation, ref)
      const existing = await db.verses.get(key)
      if (existing && !existing.deletedAt) continue
      if (existing) {
        await db.verses.update(key, { deletedAt: null, addedAt: now })
      } else {
        await db.verses.add({
          key, translation, ...ref, addedAt: now, strength: 0, stage: 0, nextReviewAt: now, updatedAt: now,
          lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0,
        })
      }
      added++
    }
  })
  return added
}

/** Убрать стихи из списка изучаемых */
export async function removeVerses(keys: string[]) {
  await db.transaction('rw', db.verses, async () => {
    if (getSyncUserId()) {
      const now = Date.now()
      for (const key of keys) await db.verses.update(key, { deletedAt: now })
    } else {
      await db.verses.bulkDelete(keys)
    }
  })
}

/**
 * Записывает результат упражнения по стиху: обновляет силу и дату повторения, добавляет запись в журнал.
 * Возвращает, как изменилась сила, и сколько получено опыта.
 */
export async function recordVerseResult(
  key: string,
  input: { exercise: string; tier: Tier; score: number },
  now = Date.now(),
) {
  return db.transaction('rw', db.verses, db.reviews, async () => {
    const verse = await db.verses.get(key)
    if (!verse || verse.deletedAt) throw new Error('Стих не найден')
    const { verse: updated, change } = applyVerseResult(verse, input, now)
    await db.verses.put(updated)
    const xp = xpFor(input.tier, input.score)
    await db.reviews.add({
      uid: uuid(), verseKey: key, exercise: input.exercise, tier: input.tier, score: input.score, xp, createdAt: now,
    })
    return { change, xp, strength: updated.strength }
  })
}

// ---------- Уроки ----------

/** Пройденные уроки по порядку */
export const liveLessons = () => db.lessons.orderBy('createdAt').toArray()

export async function saveLesson(input: { verseKeys: string[]; xp: number; mistakes: number }) {
  await db.lessons.add({ uid: uuid(), ...input, createdAt: Date.now() })
}

/** Книги последних вопросов «где написано» (самые свежие первыми): по ним решается, не надоел ли вопрос */
export async function recentWhereBooks(limit = 10): Promise<string[]> {
  const rows = await db.reviews
    .orderBy('createdAt')
    .reverse()
    .filter((r) => r.exercise === 'whereWritten')
    .limit(limit)
    .toArray()
  return rows.map((r) => parseKey(r.verseKey)?.book).filter((b): b is string => !!b)
}
