import { loadBook } from '../bible/bible'
import { formatRange, parseKey, TRANSLATION } from '../bible/refs'
import type { VerseText } from './types'

/** Подгружает тексты стихов (и главы целиком, из неё берутся неверные варианты ответа). Стихи без текста пропускаются. */
export async function loadTexts(keys: string[]): Promise<Map<string, VerseText>> {
  const out = new Map<string, VerseText>()
  for (const key of keys) {
    const p = parseKey(key)
    if (!p) continue
    const chapters = await loadBook(TRANSLATION, p.book)
    const verses = chapters[p.chapter - 1] ?? []
    const text = verses[p.verse - 1]
    if (!text) continue
    out.set(key, {
      key, book: p.book, chapter: p.chapter, verse: p.verse,
      ref: formatRange({ book: p.book, chapter: p.chapter, from: p.verse, to: p.verse }),
      text,
      chapterText: verses.filter(Boolean).join(' '),
      bookChapters: chapters.length,
      chapterVerses: verses.length,
    })
  }
  return out
}
