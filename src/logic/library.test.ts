import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { buildLibrary, levelCounts } from './library'

function verse(book: string, chapter: number, n: number, strength: number, nextReviewAt = 0): VerseState {
  return {
    key: `rst:${book}:${chapter}:${n}`, translation: 'rst', book, chapter, verse: n,
    addedAt: 0, strength, stage: strength > 0 ? 1 : 0, nextReviewAt, updatedAt: 0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0,
  }
}

describe('список «Мои стихи»', () => {
  it('соседние стихи одной твёрдости склеиваются, разной — нет', () => {
    const rows = buildLibrary([
      verse('jhn', 10, 1, 2), verse('jhn', 10, 2, 1), verse('jhn', 10, 3, 4), verse('jhn', 10, 4, 4),
    ])
    expect(rows.map((r) => `${r.from}-${r.to}:${r.level}`)).toEqual(['1-2:started', '3-4:medium'])
  })

  it('главы и книги не склеиваются; порядок как в Библии', () => {
    const rows = buildLibrary([
      verse('rom', 8, 1, 3), verse('jhn', 10, 18, 3), verse('jhn', 11, 1, 3), verse('gen', 1, 1, 3), verse('jas', 1, 1, 3),
    ])
    expect(rows.map((r) => `${r.book}${r.chapter}:${r.from}`)).toEqual(['gen1:1', 'jhn10:18', 'jhn11:1', 'jas1:1', 'rom8:1'])
  })

  it('сила и срок группы — по самому слабому и самому раннему стиху', () => {
    const [row] = buildLibrary([verse('mat', 5, 7, 4, 900), verse('mat', 5, 8, 3, 300)])
    expect(row.level).toBe('medium')
    expect(row.minStrength).toBe(3)
    expect(row.soonest).toBe(300)
    expect(row.keys).toEqual(['rst:mat:5:7', 'rst:mat:5:8'])
  })

  it('седьмой уровень — отдельная группа «выучено»', () => {
    const rows = buildLibrary([verse('mat', 5, 1, 6), verse('mat', 5, 2, 7), verse('mat', 5, 3, 7)])
    expect(rows.map((r) => `${r.from}-${r.to}:${r.level}`)).toEqual(['1-1:strong', '2-3:learned'])
    expect(levelCounts([verse('mat', 5, 1, 7)]).learned).toBe(1)
  })

  it('подсчёт по твёрдости', () => {
    const counts = levelCounts([verse('mat', 5, 1, 0), verse('mat', 5, 2, 1), verse('mat', 5, 3, 3), verse('mat', 5, 4, 6), verse('mat', 5, 5, 6)])
    expect(counts).toEqual({ new: 1, started: 1, medium: 1, strong: 2, learned: 0 })
  })
})
