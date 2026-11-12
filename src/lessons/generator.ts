import { bookOrder } from '../bible/books'
import { compareVerses } from '../bible/refs'
import { shuffle, type Rng } from '../logic/exercises'
import { isDue, needsAttention } from '../logic/mastery'
import type { VerseState } from '../types'
import type { LessonStep, StepSettings } from './types'

const MAX_VERSES = 4
const MAX_NEW = 2
const DAY = 24 * 60 * 60 * 1000

const ref = (v: VerseState) => ({ book: v.book, chapter: v.chapter, verse: v.verse })
const byBible = (a: VerseState, b: VerseState) => compareVerses(ref(a), ref(b))

/**
 * «Расстояние» между стихами в Библии: в одной главе — разница номеров стихов,
 * в одной книге — от 100, в разных книгах — от 1000. Нужно, чтобы в урок попадали стихи по соседству.
 */
export function distance(a: VerseState, b: VerseState): number {
  if (a.book !== b.book) return 1000 + Math.abs(bookOrder(a.book) - bookOrder(b.book))
  if (a.chapter !== b.chapter) return 100 + Math.abs(a.chapter - b.chapter)
  return Math.abs(a.verse - b.verse)
}

/** Стихи такого уровня и выше считаются выученными до предела: в уроки они попадают редко */
export const TOP_STRENGTH = 6
export const isTop = (v: VerseState): boolean => v.strength >= TOP_STRENGTH

/**
 * Какие стихи вообще можно брать в урок. Стихи высшего уровня попадают в урок, только если им сегодня пора повторяться
 * (по графику или с опозданием) либо если стихов слабее не осталось совсем. Если слабые стихи есть, а у сильного
 * сегодня по графику повторения нет, он в уроки не попадает вообще.
 */
export function lessonPool(all: VerseState[], now: number): VerseState[] {
  if (all.every(isTop)) return all
  return all.filter((v) => !isTop(v) || isDue(v, now))
}

/** Контекст планирования: что уже спрашивали недавно (чтобы не надоедать однотипными вопросами) */
export interface PlanContext {
  /** Книги последних вопросов «где написано», самые свежие первыми */
  recentWhere: string[]
}

/**
 * Пропустить ли вопрос «где написано» для стиха из этой книги. Если подряд несколько раз ответом была та же книга,
 * вопрос бессмыслен (ответ всегда один), поэтому его всё реже предлагают, пока не сменится книга.
 */
export function shouldSkipWhere(book: string, recent: string[], rng: Rng = Math.random): boolean {
  let n = 0
  while (n < recent.length && recent[n] === book) n++
  if (n >= 3) return true
  if (n === 2) return rng() < 0.7
  if (n === 1) return rng() < 0.4
  return false
}

/** Настройки «частично скрытого текста»: чем сильнее стих, тем больше скрыто */
export function partialSettings(strength: number): StepSettings {
  return { wordPct: Math.min(50, 10 + 8 * strength), letterPct: Math.min(100, 20 + 15 * strength) }
}

/** Настройки выбора пропущенных слов: чем сильнее стих, тем больше пропусков и вариантов */
export function gapSettings(strength: number): StepSettings {
  if (strength <= 1) return { blanks: 2, options: 4 }
  if (strength === 2) return { blanks: 3, options: 4 }
  if (strength <= 4) return { blanks: 5, options: 5 }
  return { blanks: 7, options: 5 }
}

/** Для ввода по памяти нужны стихи, которые уже можно вводить хотя бы с подсказками */
export const TYPING_MIN_STRENGTH = 2

/**
 * Ввод по памяти: сколько процентов слов уже стоит на месте. Чем сильнее стих, тем меньше подсказок
 * (с силы 4 — чистый лист), а несколько стихов подряд вводить труднее, поэтому подсказок у них меньше.
 */
export function typingVisiblePct(strength: number, count = 1): number {
  const base = strength <= 2 ? 60 : strength === 3 ? 35 : 0
  const factor = count >= 3 ? 0.35 : count === 2 ? 0.6 : 1
  return Math.round(base * factor)
}

// ---------- Подбор стихов ----------

/** Случайная выборка без возвращения: чем больше вес, тем вероятнее попасть в урок */
export function weightedSample<T>(items: T[], weight: (t: T) => number, k: number, rng: Rng = Math.random): T[] {
  const pool = items.map((t) => ({ t, w: Math.max(0, weight(t)) }))
  const out: T[] = []
  while (out.length < k && pool.length > 0) {
    const total = pool.reduce((n, p) => n + p.w, 0)
    if (total <= 0) {
      out.push(pool.shift()!.t)
      continue
    }
    let r = rng() * total
    let i = 0
    for (; i < pool.length; i++) {
      r -= pool[i].w
      if (r <= 0) break
    }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0].t)
  }
  return out
}

/**
 * Обычный урок. Новые стихи вводятся строго по порядку Библии (до двух за урок), чтобы длинный отрывок
 * разучивался с начала. Остальные места занимают стихи по соседству с ними, которым пора повторяться
 * или где была ошибка; если таких мало, добавляются ближайшие по тексту. Результат отсортирован как в Библии.
 */
export function pickVerses(verses: VerseState[], now: number): VerseState[] {
  const newOnes = verses.filter((v) => v.strength === 0).sort(byBible).slice(0, MAX_NEW)
  const urgent = verses
    .filter((v) => v.strength >= 1 && (isDue(v, now) || needsAttention(v)))
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.nextReviewAt - b.nextReviewAt)

  const anchor = newOnes[0] ?? urgent[0]
  const taken = new Set(newOnes.map((v) => v.key))
  const list = [...newOnes]
  if (anchor) {
    const near = urgent
      .filter((v) => !taken.has(v.key))
      .sort((a, b) => distance(anchor, a) - distance(anchor, b))
    for (const v of near) {
      if (list.length >= MAX_VERSES) break
      list.push(v)
      taken.add(v.key)
    }
  }

  // Если набралось мало, добавляем ближайшие по тексту уже начатые стихи (новые сверх лимита не вводим)
  if (list.length < 3) {
    const started = verses.filter((v) => v.strength >= 1 && !taken.has(v.key))
    const center =
      anchor ?? [...started].sort((a, b) => a.strength - b.strength || (a.lastPracticedAt ?? 0) - (b.lastPracticedAt ?? 0))[0]
    if (center) {
      started.sort((a, b) => distance(center, a) - distance(center, b) || a.strength - b.strength)
      list.push(...started.slice(0, 3 - list.length))
    }
  }
  return list.sort(byBible)
}

/** Подряд идущие стихи после данного (не больше трёх), которые тоже учатся и уже не новые */
export function followingVerses(v: VerseState, all: VerseState[]): VerseState[] {
  const same = new Map(all.filter((x) => x.book === v.book && x.chapter === v.chapter && x.strength >= 1).map((x) => [x.verse, x]))
  const out: VerseState[] = []
  for (let n = v.verse + 1; out.length < 3 && same.has(n); n++) out.push(same.get(n)!)
  return out
}

// ---------- Упражнения для стиха ----------

type Candidate = Pick<LessonStep, 'kind' | 'settings' | 'verseKeys'>

const where = (v: VerseState, levels: 1 | 2 | 3): Candidate => ({ kind: 'whereWritten', verseKeys: [v.key], settings: { levels } })
const letters = (v: VerseState, hintLevel: 1 | 2 | 3): Candidate => ({ kind: 'firstLetters', verseKeys: [v.key], settings: { hintLevel } })

/**
 * Упражнения для одного стиха, который уже учится: дополнительные и «главное»
 * (его сложности достаточно для роста силы). Главное идёт последним.
 * Если стиху подошёл срок повторения, дополнительных упражнений два вместо одного: в этот день он встречается чаще.
 * Вопрос «где написано» пропускается, если несколько раз подряд ответом была та же книга.
 */
function reviewSteps(v: VerseState, all: VerseState[], rng: Rng, now: number, ctx: PlanContext): Candidate[] {
  const s = v.strength
  const own = [v.key]
  const run = followingVerses(v, all)
  const parts: Candidate | null = run.length > 0 ? { kind: 'orderParts', settings: {}, verseKeys: [v.key, ...run.map((x) => x.key)] } : null
  const c = (kind: LessonStep['kind'], settings: StepSettings): Candidate => ({ kind, settings, verseKeys: own })

  // gates — упражнения, сложности которых достаточно для роста силы; others — разминка и поддержка
  let gates: Candidate[]
  let others: Candidate[]
  if (s <= 1) {
    gates = [c('fillGaps', gapSettings(s))]
    others = [c('partial', partialSettings(s)), where(v, 1), letters(v, 1)]
  } else if (s === 2) {
    gates = [c('assemble', { pieces: 6 }), letters(v, 2)]
    others = [c('fillGaps', gapSettings(s)), c('partial', partialSettings(s)), letters(v, 1)]
  } else if (s === 3) {
    gates = [c('assemble', { pieces: 9 }), letters(v, 3), ...(parts ? [parts, parts] : [])]
    others = [where(v, 2), c('fillGaps', gapSettings(s)), letters(v, 2)]
  } else if (s === 4) {
    // дальше рост требует ввода по памяти с чистого листа (тестовый урок), здесь поддержка
    gates = [c('assemble', { pieces: 12 }), letters(v, 3), ...(parts ? [parts, parts] : [])]
    others = [c('fillGaps', gapSettings(s)), where(v, 3)]
  } else {
    gates = [c('fillGaps', gapSettings(s)), letters(v, 3)]
    others = [where(v, 3), c('assemble', { pieces: 14 })]
  }

  if (shouldSkipWhere(v.book, ctx.recentWhere, rng)) others = others.filter((o) => o.kind !== 'whereWritten')
  if (others.length === 0) others = [c('fillGaps', gapSettings(s))]

  // Сильному стиху достаётся немного упражнений: одно дополнительное и главное
  const extra = isDue(v, now) && !isTop(v) ? 2 : 1
  const chosen = [...shuffle(others, rng).slice(0, extra), shuffle(gates, rng)[0]]
  if (chosen.some((x) => x.kind === 'whereWritten')) ctx.recentWhere.unshift(v.book)
  return chosen
}

function toSteps(candidates: Candidate[]): LessonStep[] {
  return candidates.map((c, n) => ({ id: `${c.kind}:${c.verseKeys.join('+')}:${n}`, ...c }))
}

// ---------- Планы уроков ----------

const restrict = (all: VerseState[], only?: Set<string>) => (only ? all.filter((v) => only.has(v.key)) : all)

/** Несложные упражнения для только что изученного стиха (порядок свободный) */
function easyPractice(v: VerseState, rng: Rng, ctx: PlanContext): Candidate[] {
  const own = [v.key]
  const pool: Candidate[] = [
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 2, options: 4 } },
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 3, options: 4 } },
    { kind: 'assemble', verseKeys: own, settings: { pieces: 4 } },
    letters(v, 1),
    ...(shouldSkipWhere(v.book, ctx.recentWhere, rng) ? [] : [where(v, 1)]),
  ]
  const chosen = shuffle(pool, rng).slice(0, 3)
  if (chosen.some((x) => x.kind === 'whereWritten')) ctx.recentWhere.unshift(v.book)
  return chosen
}

const newContext = (ctx?: PlanContext): PlanContext => ({ recentWhere: [...(ctx?.recentWhere ?? [])] })

/** Сколько стихов подряд вводить по памяти: чаще один, иногда два, реже три */
export function pickTypingCount(rng: Rng = Math.random): 1 | 2 | 3 {
  const r = rng()
  return r < 0.5 ? 1 : r < 0.8 ? 2 : 3
}

/** Вес стиха при выборе того, который вводить по памяти: нужнее тем, кому пора повторяться и кто на средней силе */
function typingWeight(v: VerseState, now: number, inLesson: boolean): number {
  let w = 1
  if (isDue(v, now)) w += 3
  if (needsAttention(v)) w += 2
  if (v.strength >= TYPING_MIN_STRENGTH && v.strength < TOP_STRENGTH) w += 2 // именно им ввод по памяти поднимает силу
  if (inLesson) w += 3 // предпочитаем стихи, по которым идёт этот урок
  if (isTop(v)) w *= 0.3
  return w
}

/**
 * Ввод по памяти: одно задание на урок. Берётся один стих или несколько подряд (до трёх). Чем слабее стих,
 * тем больше слов подсказано; с силы 4 текст вводится с чистого листа.
 */
function typingStep(base: VerseState[], focus: Set<string>, now: number, rng: Rng): Candidate | null {
  const eligible = base.filter((v) => v.strength >= TYPING_MIN_STRENGTH)
  if (eligible.length === 0) return null
  const anchor = weightedSample(eligible, (v) => typingWeight(v, now, focus.has(v.key)), 1, rng)[0]

  const want = pickTypingCount(rng)
  const run: VerseState[] = [anchor]
  for (const next of followingVerses(anchor, base)) {
    if (run.length >= want || next.strength < TYPING_MIN_STRENGTH) break
    run.push(next)
  }
  const weakest = Math.min(...run.map((v) => v.strength))
  return {
    kind: 'typing',
    verseKeys: run.map((v) => v.key),
    settings: { visiblePct: typingVisiblePct(weakest, run.length) },
  }
}

/**
 * Урок. Новые стихи вводятся по порядку Библии (знакомство, затем несколько несложных упражнений вперемешку),
 * затем повторение тех, что уже учатся. В конце один раз за урок — ввод по памяти одного, двух или трёх стихов подряд.
 * only — повтор прошлого урока: берутся только эти стихи.
 */
export function planLesson(
  all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>, context?: PlanContext,
): LessonStep[] {
  const ctx = newContext(context)
  const pool = only ? restrict(all, only) : lessonPool(all, now)
  const picked = only ? [...pool].sort(byBible).slice(0, MAX_VERSES) : pickVerses(pool, now)
  const fresh = picked.filter((x) => x.strength === 0)
  const out: Candidate[] = []
  for (const v of fresh) {
    out.push({ kind: 'reveal', verseKeys: [v.key], settings: { chunk: 2 } })
    out.push({ kind: 'partial', verseKeys: [v.key], settings: partialSettings(0) })
  }
  out.push(...shuffle(fresh.flatMap((v) => easyPractice(v, rng, ctx)), rng))
  for (const v of picked.filter((x) => x.strength > 0)) out.push(...reviewSteps(v, pool, rng, now, ctx))

  const typing = typingStep(pool, new Set(picked.map((v) => v.key)), now, rng)
  if (typing) out.push(typing)
  return toSteps(out)
}
