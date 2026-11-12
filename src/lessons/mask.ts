import { shuffle, type FlatWord, type Rng } from '../logic/exercises'

/** Случайные «ранги» слов и букв. Они фиксируются один раз, поэтому при движении ползунков скрытое меняется плавно. */
export interface MaskRanks {
  word: number[]
  letters: number[][]
}

export function makeRanks(words: FlatWord[], rng: Rng = Math.random): MaskRanks {
  return {
    word: words.map(() => rng()),
    letters: words.map((w) => [...w.core].map(() => rng())),
  }
}

const isLetter = (c: string) => /[\p{L}\p{N}]/u.test(c)

/**
 * Скрывает часть слов целиком (wordPct, 0–50%) и часть букв в оставшихся словах (letterPct, 0–100%).
 * Первая буква слова остаётся всегда, поэтому 100% — это «только первые буквы».
 * Возвращает для каждого слова вид с «_» вместо скрытых букв или null, если слово показывается целиком.
 */
export function applySliderMask(
  words: FlatWord[],
  ranks: MaskRanks,
  wordPct: number,
  letterPct: number,
): (string | null)[] {
  const letterIdx = words.map((w) =>
    [...w.core].map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0),
  )

  // Слова, скрываемые целиком: с наименьшими рангами среди слов, в которых есть буквы
  const eligible = words.map((_, i) => i).filter((i) => letterIdx[i].length > 0)
  const hideCount = Math.round((eligible.length * Math.max(0, Math.min(50, wordPct))) / 100)
  const hiddenWords = new Set(
    [...eligible].sort((a, b) => ranks.word[a] - ranks.word[b]).slice(0, hideCount),
  )

  const pct = Math.max(0, Math.min(100, letterPct)) / 100
  return words.map((w, i) => {
    const idx = letterIdx[i]
    if (idx.length === 0) return null
    const chars = [...w.core]

    if (hiddenWords.has(i)) return chars.map((c, k) => (idx.includes(k) ? '_' : c)).join('')

    const inner = idx.slice(1) // первая буква остаётся
    const n = Math.round(inner.length * pct)
    if (n === 0) return null
    const hide = new Set([...inner].sort((a, b) => ranks.letters[i][a] - ranks.letters[i][b]).slice(0, n))
    return chars.map((c, k) => (hide.has(k) ? '_' : c)).join('')
  })
}

/**
 * Какие слова показать заранее при вводе по памяти: pct процентов слов с буквами выбираются случайно.
 * Слова без букв (тире и т.п.) всегда показаны. Результат: true — слово уже стоит на месте.
 */
export function pickVisibleWords(words: FlatWord[], pct: number, rng: Rng = Math.random): boolean[] {
  const eligible = words.map((_, i) => i).filter((i) => isLetter(words[i].core[0] ?? '') || /[\p{L}\p{N}]/u.test(words[i].core))
  const eligibleSet = new Set(eligible)
  const show = Math.round((eligible.length * Math.max(0, Math.min(100, pct))) / 100)
  const chosen = new Set(shuffle(eligible, rng).slice(0, show))
  return words.map((_, i) => chosen.has(i) || !eligibleSet.has(i))
}
