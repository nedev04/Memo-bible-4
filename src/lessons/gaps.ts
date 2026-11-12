import { firstChar, normalize, pickDistractors, shuffle, type FlatWord, type Rng } from '../logic/exercises'

export interface VerseGap {
  wordIndex: number
  answer: string
  /** Варианты в случайном порядке, среди них правильный */
  options: string[]
}

/**
 * Пропуски в стихе. Неверные варианты берутся из ответов ИИ (если они есть для этого слова), иначе из слов всей главы (pool),
 * подобранных по длине и окончанию. Слова, для которых есть варианты от ИИ, выбираются в первую очередь.
 * ai — номер слова в стихе → неверные варианты.
 */
export function buildVerseGaps(
  words: FlatWord[],
  pool: FlatWord[],
  blanks: number,
  optionCount: number,
  rng: Rng = Math.random,
  ai?: Map<number, string[]>,
): VerseGap[] {
  let candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => w.core.length >= 3)
  if (candidates.length === 0) candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => firstChar(w) !== null)

  const shuffled = shuffle(candidates, rng)
  const ordered = ai && ai.size > 0 ? [...shuffled.filter(({ i }) => ai.has(i)), ...shuffled.filter(({ i }) => !ai.has(i))] : shuffled

  const chosen: number[] = []
  for (const { i } of ordered) {
    if (chosen.length >= blanks) break
    if (chosen.some((c) => Math.abs(c - i) === 1)) continue // пропуски не стоят рядом
    chosen.push(i)
  }
  chosen.sort((a, b) => a - b)

  const gaps: VerseGap[] = []
  for (const wordIndex of chosen) {
    const answer = words[wordIndex].core
    const wrong = shuffle(ai?.get(wordIndex) ?? [], rng).slice(0, optionCount - 1)
    if (wrong.length < optionCount - 1) {
      // Не хватило вариантов от ИИ: добираем из слов главы
      const seen = new Set([normalize(answer), ...wrong.map(normalize)])
      for (const d of pickDistractors(pool, answer, optionCount - 1, 2, rng)) {
        if (wrong.length >= optionCount - 1) break
        if (!seen.has(normalize(d))) {
          wrong.push(d)
          seen.add(normalize(d))
        }
      }
    }
    if (wrong.length === 0) continue // не из чего выбирать
    gaps.push({ wordIndex, answer, options: shuffle([answer, ...wrong], rng) })
  }
  return gaps
}
