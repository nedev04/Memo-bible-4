import { bookOrder, getBook } from './books'
import type { VerseRef } from './types'

/** Код перевода, который используется сейчас (Синодальный) */
export const TRANSLATION = 'rst'

/** Ключ стиха: rst:mat:5:7 */
export function verseKey(translation: string, ref: VerseRef): string {
  return `${translation}:${ref.book}:${ref.chapter}:${ref.verse}`
}

export function parseKey(key: string): (VerseRef & { translation: string }) | null {
  const m = key.match(/^([a-z0-9-]+):([a-z0-9]+):(\d+):(\d+)$/)
  if (!m) return null
  return { translation: m[1], book: m[2], chapter: Number(m[3]), verse: Number(m[4]) }
}

/** Порядок «как в Библии»: книга, глава, стих */
export function compareVerses(a: VerseRef, b: VerseRef): number {
  return bookOrder(a.book) - bookOrder(b.book) || a.chapter - b.chapter || a.verse - b.verse
}

export interface VerseGroup {
  book: string
  chapter: number
  from: number
  to: number
  /** Номера стихов в группе */
  verses: number[]
}

/**
 * Склеивает подряд идущие стихи одной главы в диапазоны. Стихи разных глав и книг не склеиваются.
 * Результат отсортирован как в Библии.
 */
export function groupVerses(refs: VerseRef[]): VerseGroup[] {
  const sorted = [...refs].sort(compareVerses)
  const groups: VerseGroup[] = []
  for (const r of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.book === r.book && last.chapter === r.chapter && r.verse === last.to + 1) {
      last.to = r.verse
      last.verses.push(r.verse)
    } else if (!(last && last.book === r.book && last.chapter === r.chapter && r.verse === last.to)) {
      groups.push({ book: r.book, chapter: r.chapter, from: r.verse, to: r.verse, verses: [r.verse] })
    }
  }
  return groups
}

/** «Матфея 5:7» или «Матфея 5:7–9» */
export function formatRange(g: { book: string; chapter: number; from: number; to: number }): string {
  const name = getBook(g.book)?.name ?? g.book
  return g.from === g.to ? `${name} ${g.chapter}:${g.from}` : `${name} ${g.chapter}:${g.from}–${g.to}`
}
