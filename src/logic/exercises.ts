import type { Difficulty } from '../types'
import { parseLines, splitToken } from './parser'

/** Генератор случайных чисел [0,1). В тестах подменяется на детерминированный. */
export type Rng = () => number

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Нижний регистр, «ё» = «е» — для сравнения ответов */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
}

// ---------- Плоский список слов ----------

export interface FlatWord {
  raw: string
  lead: string
  core: string
  trail: string
  newLine: boolean
  blankBefore: boolean
}

export function flattenWords(content: string): FlatWord[] {
  const out: FlatWord[] = []
  parseLines(content).forEach((line, li) => {
    line.words.forEach((w, wi) => {
      const t = splitToken(w)
      out.push({ ...t, newLine: wi === 0 && li > 0, blankBefore: wi === 0 && line.blankBefore })
    })
  })
  return out
}

/** Первая буква (или цифра) слова в нормализованном виде; null, если в слове нет букв (например, «—») */
export function firstChar(w: FlatWord): string | null {
  const m = w.core.match(/[\p{L}\p{N}]/u)
  return m ? normalize(m[0]) : null
}

// ---------- Первые буквы ----------

/** true — слово видно до ввода буквы. Лёгкая: все, средняя: примерно половина, тяжёлая: ни одного. */
export function visibleMask(words: FlatWord[], difficulty: Difficulty, rng: Rng = Math.random): boolean[] {
  return words.map((w) => {
    if (firstChar(w) === null) return true
    if (difficulty === 1) return true
    if (difficulty === 2) return rng() < 0.5
    return false
  })
}

export function matchCase(word: string, like: string): string {
  const first = like.charAt(0)
  const upper = first !== first.toLowerCase()
  const head = word.charAt(0)
  return (upper ? head.toUpperCase() : head.toLowerCase()) + word.slice(1)
}

function sharedSuffix(a: string, b: string): number {
  let n = 0
  while (n < Math.min(a.length, b.length, 3) && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/**
 * Подбирает слова из самого текста, похожие на answer, но не совпадающие с ним.
 * Чем выше сложность, тем похожее слова (по длине и первой букве). Первое в списке — самое подходящее.
 */
export function pickDistractors(
  words: FlatWord[],
  answer: string,
  count: number,
  difficulty: Difficulty,
  rng: Rng = Math.random,
): string[] {
  const ansNorm = normalize(answer)
  const pool = new Map<string, string>()
  for (const w of words) {
    if (w.core.length >= 2) pool.set(normalize(w.core), w.core)
  }
  return [...pool.entries()]
    .filter(([k]) => k !== ansNorm)
    .map(([k, v]) => {
      let key = 0
      if (difficulty >= 2) key += Math.abs(v.length - answer.length)
      if (difficulty === 3 && k.charAt(0) === ansNorm.charAt(0)) key -= 1.5
      // Слова с тем же окончанием обычно той же формы (падеж, число), поэтому звучат в тексте естественнее
      if (difficulty >= 2) key -= Math.min(2, sharedSuffix(k, ansNorm)) * 0.8
      return { v, key: key + rng() * 1.5 }
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((x) => matchCase(x.v, answer))
}

// ---------- Части и их порядок ----------

const STRONG_END = /[.!?…][»"')\]]*$/
const WEAK_END = /[,;:—–][»"')\]]*$/

/** Где разрезать строку из слов: у знака препинания рядом с серединой (конец предложения лучше запятой) */
export function splitPoint(words: string[]): number {
  const mid = words.length / 2
  let best = -1
  let bestCost = Infinity
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]
    const strong = STRONG_END.test(prev)
    if (!strong && !WEAK_END.test(prev)) continue
    if (i < words.length * 0.3 || i > words.length * 0.7) continue
    const cost = Math.abs(i - mid) + (strong ? 0 : words.length * 0.1)
    if (cost < bestCost) { best = i; bestCost = cost }
  }
  return best === -1 ? Math.ceil(mid) : best
}

/** Перемешивает так, чтобы порядок не совпал с исходным (если это возможно) */
export function shuffleBlocks(blocks: string[], rng: Rng = Math.random): number[] {
  const idx = blocks.map((_, i) => i)
  const sameAsOriginal = (order: number[]) => order.every((o, i) => blocks[o] === blocks[i])
  let order = shuffle(idx, rng)
  for (let tries = 0; tries < 20 && sameAsOriginal(order); tries++) order = shuffle(idx, rng)
  return order
}

const joinText = (parts: string[]): string => parts.join(' ').replace(/\s+/g, ' ').trim()

/**
 * Совпадает ли итоговый текст. Части могут стоять иначе, чем в исходной разбивке, если от этого текст не меняется:
 * например, «для того,» одной частью в одном месте и «для», «того,» двумя частями в другом.
 */
export function sameOrderText(placed: string[], correct: string[]): boolean {
  return joinText(placed) === joinText(correct)
}

/** Доля частей, стоящих на своих местах, в процентах; если итоговый текст верный, всегда 100 */
export function scoreOrder(placed: string[], correct: string[]): number {
  if (correct.length === 0) return 100
  if (sameOrderText(placed, correct)) return 100
  const ok = correct.filter((b, i) => placed[i] === b).length
  return Math.round((ok / correct.length) * 100)
}

// ---------- Строки и ввод слов ----------

/** Собирает плоский список слов из строк (каждая строка — массив слов) */
export function fromLines(lines: string[][]): FlatWord[] {
  const out: FlatWord[] = []
  lines.forEach((line, li) =>
    line.forEach((w, wi) => out.push({ ...splitToken(w), newLine: wi === 0 && li > 0, blankBefore: false })),
  )
  return out
}

export interface LineSpan {
  start: number
  /** Индекс после последнего слова строки */
  end: number
  blankBefore: boolean
}

/** Группирует плоский список слов по строкам */
export function groupLines(words: FlatWord[]): LineSpan[] {
  const spans: LineSpan[] = []
  words.forEach((w, i) => {
    if (i === 0 || w.newLine) spans.push({ start: i, end: i + 1, blankBefore: w.blankBefore })
    else spans[spans.length - 1].end = i + 1
  })
  return spans
}

export type TypedVerdict = 'wait' | 'ok' | 'bad'

/**
 * Решает, что делать с набранным словом.
 * ok/bad — слово засчитывается (верно/неверно), wait — продолжаем ввод.
 * Слово засчитывается: при точном совпадении, по пробелу, или когда набрано столько же букв, сколько в слове.
 */
export function judgeTyped(typed: string, core: string): TypedVerdict {
  const ends = /\s$/.test(typed)
  const raw = typed.trim()
  if (raw === '') return 'wait'
  // Знаки препинания по краям, если пользователь их всё же набрал, не считаются ошибкой
  const t = splitToken(raw).core || raw
  if (normalize(t) === normalize(core)) return 'ok'
  if (ends || [...t].length >= [...core].length) return 'bad'
  return 'wait'
}

/**
 * Делит текст на указанное число частей примерно равной длины, предпочитая границы по знакам препинания.
 * Если слов не больше, чем частей, каждое слово становится отдельной частью.
 */
export function splitIntoPieces(text: string, pieces: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= pieces) return words
  const units = [words]
  while (units.length < pieces) {
    let longest = 0
    units.forEach((u, i) => { if (u.length > units[longest].length) longest = i })
    if (units[longest].length < 2) break
    const u = units[longest]
    const at = splitPoint(u)
    units.splice(longest, 1, u.slice(0, at), u.slice(at))
  }
  return units.map((u) => u.join(' '))
}
