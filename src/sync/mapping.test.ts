import { describe, expect, it } from 'vitest'
import type { LessonRecord, VerseReview, VerseState } from '../types'
import {
  isKnownLessonRow, isKnownVerseRow, lessonToRow, maxServerTime, remoteWins, reviewToRow, rowToLesson, rowToReview,
  rowToVerse, sinceIso, verseToRow,
} from './mapping'

const verse: VerseState = {
  key: 'rst:mat:5:7', translation: 'rst', book: 'mat', chapter: 5, verse: 7, addedAt: 10, strength: 3, stage: 2, nextReviewAt: 500,
  lastUpAt: 400, lastPracticedAt: 450, lastScore: 90, lapses: 1, updatedAt: 460, dirty: 1,
}
const review: VerseReview = { id: 5, uid: 'r1', verseKey: verse.key, exercise: 'typing', tier: 3, score: 95, xp: 14, createdAt: 450, dirty: 1 }
const lesson: LessonRecord = { id: 3, uid: 'l1', verseKeys: ['rst:mat:5:7', 'rst:mat:5:8'], xp: 40, mistakes: 2, createdAt: 700, dirty: 1 }

describe('слияние', () => {
  it('побеждает более новая запись', () => {
    expect(remoteWins(undefined, 1)).toBe(true)
    expect(remoteWins({ updatedAt: 100 }, 101)).toBe(true)
    expect(remoteWins({ updatedAt: 100 }, 100)).toBe(false)
    expect(remoteWins({ updatedAt: 100 }, 99)).toBe(false)
  })

  it('курсор: максимум по серверному времени и запас назад', () => {
    const rows = [
      { server_updated_at: '2026-03-10T12:00:00.500000+00:00' },
      { server_updated_at: '2026-03-10T12:00:05.000000+00:00' },
      {},
    ]
    const max = maxServerTime(rows, null)
    expect(max).toBe(Date.parse('2026-03-10T12:00:05Z'))
    expect(maxServerTime([], 123)).toBe(123)
    expect(sinceIso(null)).toBe('1970-01-01T00:00:00.000Z')
    expect(Date.parse(sinceIso(max))).toBe(Date.parse('2026-03-10T11:55:05Z'))
  })
})

describe('стихи и журнал', () => {
  it('стих: туда и обратно', () => {
    const row = verseToRow(verse, 'user')
    expect(row.user_id).toBe('user')
    expect(row.deleted_at).toBeNull()
    const { dirty: _d, ...expected } = verse
    expect(rowToVerse(row)).toEqual({ ...expected, deletedAt: null, dirty: 0 })
  })

  it('стих с пустыми полями прогресса и удалённый', () => {
    const fresh = { ...verse, lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0, deletedAt: 999 }
    const back = rowToVerse(verseToRow(fresh, 'u'))
    expect(back.lastUpAt).toBeNull()
    expect(back.deletedAt).toBe(999)
  })

  it('старая строка без стадии получает стадию по силе', () => {
    const legacy = { ...verseToRow(verse, 'u'), stage: 0 }
    expect(rowToVerse(legacy).stage).toBe(3)
    expect(rowToVerse({ ...legacy, stage: undefined }).stage).toBe(3)
    expect(rowToVerse({ ...legacy, stage: 2 }).stage).toBe(2)
    expect(rowToVerse({ ...legacy, strength: 0, stage: 0 }).stage).toBe(0)
  })

  it('журнал: туда и обратно', () => {
    const row = reviewToRow(review, 'user')
    expect(row.verse_key).toBe('rst:mat:5:7')
    expect(rowToReview(row)).toEqual({ uid: 'r1', verseKey: verse.key, exercise: 'typing', tier: 3, score: 95, xp: 14, createdAt: 450, dirty: 0 })
  })

  it('непонятные ключи стихов пропускаются', () => {
    expect(isKnownVerseRow(verseToRow(verse, 'u'))).toBe(true)
    expect(isKnownVerseRow({ ...verseToRow(verse, 'u'), key: 'мусор' })).toBe(false)
  })
})

describe('уроки', () => {
  it('урок: туда и обратно; служебные поля облака заполняются одинаково', () => {
    const row = lessonToRow(lesson, 'user')
    expect(row.verse_keys).toEqual(['rst:mat:5:7', 'rst:mat:5:8'])
    expect(row.type).toBe('regular')
    expect(row.status).toBe('done')
    expect(rowToLesson(row)).toEqual({ uid: 'l1', verseKeys: ['rst:mat:5:7', 'rst:mat:5:8'], xp: 40, mistakes: 2, createdAt: 700, dirty: 0 })
  })

  it('уроки без стихов (пропущенные в прежней версии) пропускаются', () => {
    expect(isKnownLessonRow(lessonToRow(lesson, 'u'))).toBe(true)
    expect(isKnownLessonRow({ ...lessonToRow(lesson, 'u'), verse_keys: [] })).toBe(false)
  })
})
