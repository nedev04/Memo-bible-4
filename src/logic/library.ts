import { compareVerses, groupVerses, type VerseGroup } from '../bible/refs'
import type { VerseState } from '../types'
import { strengthGroup, type StrengthGroup } from './mastery'

/** Группа подряд идущих стихов одной главы и одной твёрдости, как строка в списке «Мои стихи» */
export interface LibraryGroup extends VerseGroup {
  level: StrengthGroup
  /** Самая низкая сила среди стихов группы */
  minStrength: number
  /** Ближайший срок повторения среди стихов группы */
  soonest: number
  /** Ключи стихов группы */
  keys: string[]
}

const id = (v: { book: string; chapter: number; verse: number }) => `${v.book}:${v.chapter}:${v.verse}`

/**
 * Список «Мои стихи»: стихи делятся по твёрдости (новые, начал, средне, твёрдо), внутри каждой твёрдости
 * соседние стихи одной главы склеиваются в одну строку. Строки идут в порядке Библии.
 * Соседние стихи с разной твёрдостью в одну строку не склеиваются.
 */
export function buildLibrary(verses: VerseState[]): LibraryGroup[] {
  const byId = new Map(verses.map((v) => [id(v), v]))
  const buckets = new Map<StrengthGroup, VerseState[]>()
  for (const v of verses) {
    const level = strengthGroup(v.strength)
    buckets.set(level, [...(buckets.get(level) ?? []), v])
  }

  const out: LibraryGroup[] = []
  for (const [level, list] of buckets) {
    for (const g of groupVerses(list)) {
      const members = g.verses
        .map((n) => byId.get(id({ book: g.book, chapter: g.chapter, verse: n })))
        .filter((m): m is VerseState => m !== undefined)
      out.push({
        ...g,
        level,
        minStrength: Math.min(...members.map((m) => m.strength)),
        soonest: Math.min(...members.map((m) => m.nextReviewAt)),
        keys: members.map((m) => m.key),
      })
    }
  }
  return out.sort((a, b) =>
    compareVerses({ book: a.book, chapter: a.chapter, verse: a.from }, { book: b.book, chapter: b.chapter, verse: b.from }),
  )
}

/** Сколько стихов в каждой твёрдости */
export function levelCounts(verses: VerseState[]): Record<StrengthGroup, number> {
  const counts: Record<StrengthGroup, number> = { new: 0, started: 0, medium: 0, strong: 0, learned: 0 }
  for (const v of verses) counts[strengthGroup(v.strength)]++
  return counts
}
