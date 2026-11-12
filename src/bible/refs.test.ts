import { describe, expect, it } from 'vitest'
import { BOOKS, bookOrder } from './books'
import { compareVerses, formatRange, groupVerses, parseKey, verseKey } from './refs'

const v = (book: string, chapter: number, verse: number) => ({ book, chapter, verse })

describe('книги', () => {
  it('66 книг, 1189 глав, номера из источника уникальны и покрывают 1–66', () => {
    expect(BOOKS).toHaveLength(66)
    expect(BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189)
    expect(new Set(BOOKS.map((b) => b.num)).size).toBe(66)
    expect(Math.min(...BOOKS.map((b) => b.num))).toBe(1)
    expect(Math.max(...BOOKS.map((b) => b.num))).toBe(66)
    expect(new Set(BOOKS.map((b) => b.id)).size).toBe(66)
  })
  it('порядок как в Синодальном издании: Иакова идёт раньше Римлянам', () => {
    expect(bookOrder('gen')).toBe(0)
    expect(bookOrder('jas')).toBeLessThan(bookOrder('rom'))
    expect(bookOrder('rev')).toBe(65)
  })
})

describe('ключи и сортировка', () => {
  it('ключ туда и обратно', () => {
    const key = verseKey('rst', v('mat', 5, 7))
    expect(key).toBe('rst:mat:5:7')
    expect(parseKey(key)).toEqual({ translation: 'rst', book: 'mat', chapter: 5, verse: 7 })
    expect(parseKey('мусор')).toBeNull()
  })
  it('сортирует по книге, главе, стиху', () => {
    const list = [v('rom', 1, 1), v('mat', 5, 10), v('gen', 2, 1), v('mat', 5, 2), v('jas', 1, 1)]
    expect(list.sort(compareVerses).map((r) => `${r.book}${r.chapter}:${r.verse}`))
      .toEqual(['gen2:1', 'mat5:2', 'mat5:10', 'jas1:1', 'rom1:1'])
  })
})

describe('groupVerses', () => {
  it('склеивает соседние стихи одной главы', () => {
    const groups = groupVerses([v('mat', 5, 9), v('mat', 5, 7), v('mat', 5, 8), v('mat', 5, 12)])
    expect(groups.map((g) => [g.from, g.to])).toEqual([[7, 9], [12, 12]])
  })
  it('не склеивает через границу главы или книги', () => {
    const groups = groupVerses([v('mat', 5, 48), v('mat', 6, 1), v('mrk', 6, 2)])
    expect(groups).toHaveLength(3)
  })
  it('повторяющиеся стихи не дублируются', () => {
    expect(groupVerses([v('mat', 5, 7), v('mat', 5, 7)])).toHaveLength(1)
  })
})

describe('formatRange', () => {
  it('одиночный стих и диапазон', () => {
    expect(formatRange({ book: 'mat', chapter: 5, from: 7, to: 7 })).toBe('Матфея 5:7')
    expect(formatRange({ book: '1sa', chapter: 3, from: 1, to: 4 })).toBe('1 Царств 3:1–4')
  })
})
