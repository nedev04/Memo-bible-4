import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from '../logic/config'
import { flattenWords, splitIntoPieces } from '../logic/exercises'
import { buildVerseGaps } from './gaps'
import {
  distance, followingVerses, gapSettings, isTop, lessonPool, partialSettings, pickTypingCount, pickVerses, planLesson,
  shouldSkipWhere, typingVisiblePct, weightedSample,
} from './generator'
import { applySliderMask, makeRanks, pickVisibleWords } from './mask'
import { stepTier, type LessonStep } from './types'
import { buildWhereQuestions, nearBooks, nearNumbers } from './where'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function verseIn(book: string, chapter: number, n: number, over: Partial<VerseState> = {}): VerseState {
  return {
    key: `rst:${book}:${chapter}:${n}`, translation: 'rst', book, chapter, verse: n,
    addedAt: T0, strength: 0, stage: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0, ...over,
  }
}
const verse = (n: number, over: Partial<VerseState> = {}) => verseIn('mat', 5, n, over)

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = 'Блаженны милостивые, ибо они помилованы будут'
const kinds = (steps: { kind: string }[]) => steps.map((s) => s.kind)
/** Шаги урока без ввода по памяти (он всегда последний) */
const withoutTyping = (steps: LessonStep[]) => steps.filter((s) => s.kind !== 'typing')

describe('подбор стихов', () => {
  it('новые вводятся строго по порядку Библии, не больше двух за урок', () => {
    const verses = Array.from({ length: 18 }, (_, i) => verse(i + 1)).reverse()
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([1, 2])
  })

  it('длинный отрывок идёт кусками подряд: за новыми стихами подтягиваются начатые соседи', () => {
    const started = (n: number) => verse(n, { strength: 2, stage: 1, nextReviewAt: T0 + DAY })
    const verses = [started(1), started(2), ...Array.from({ length: 16 }, (_, i) => verse(i + 3))]
    // новые 3 и 4, а недостающее место занимает ближайший начатый стих (2), а не далёкий
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([2, 3, 4])
  })

  it('стихи, которым пора повторяться, выбираются по соседству с новыми, а не из любого места', () => {
    const due = (n: number) => verse(n, { strength: 3, stage: 2, nextReviewAt: T0 - DAY })
    const verses = [due(3), due(40), verse(7), verse(8)]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([3, 7, 8, 40])
    const crowded = [due(3), due(4), due(40), due(41), due(42), verse(5)]
    expect(pickVerses(crowded, T0).map((v) => v.verse)).toEqual([3, 4, 5, 40])
  })

  it('без новых опорой служит самый срочный стих (с ошибкой), вокруг него собираются соседи', () => {
    const verses = [
      verse(1, { strength: 3, nextReviewAt: T0 - 5 * DAY }),
      verse(2, { strength: 3, nextReviewAt: T0 - DAY, lastScore: 40 }),
      verse(3, { strength: 3, nextReviewAt: T0 - 2 * DAY }),
      verse(30, { strength: 3, nextReviewAt: T0 - 9 * DAY }),
      verse(31, { strength: 5, nextReviewAt: T0 + 30 * DAY }),
    ]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([1, 2, 3, 30])
  })

  it('если срочного мало, добавляет ближайшие по тексту начатые стихи', () => {
    const verses = [
      verse(10, { strength: 2, nextReviewAt: T0 - DAY }),
      verse(11, { strength: 5, nextReviewAt: T0 + DAY }),
      verse(40, { strength: 1, nextReviewAt: T0 + DAY }),
    ]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([10, 11, 40])
  })

  it('расстояние растёт при смене главы и книги', () => {
    expect(distance(verse(1), verse(3))).toBe(2)
    expect(distance(verse(1), verseIn('mat', 6, 1))).toBeGreaterThan(distance(verse(1), verse(40)))
    expect(distance(verse(1), verseIn('jhn', 1, 1))).toBeGreaterThan(distance(verse(1), verseIn('mat', 28, 20)))
  })
})

describe('вопрос «где написано» не надоедает', () => {
  it('чем дольше подряд одна и та же книга, тем реже вопрос', () => {
    const sureTrue = () => 0
    const sureFalse = () => 0.99
    expect(shouldSkipWhere('jhn', [], sureTrue)).toBe(false)
    expect(shouldSkipWhere('jhn', ['mat'], sureTrue)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn'], sureTrue)).toBe(true) // 40%: при малом rng пропускаем
    expect(shouldSkipWhere('jhn', ['jhn'], sureFalse)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn'], sureFalse)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn'], () => 0.5)).toBe(true) // 70%
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn', 'jhn'], sureFalse)).toBe(true)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn', 'mat', 'jhn'], sureFalse)).toBe(false)
  })

  it('после трёх одинаковых ответов подряд вопроса по этой книге в уроке нет, по другой книге есть', () => {
    const recent = { recentWhere: ['jhn', 'jhn', 'jhn'] }
    const whereCount = (verses: VerseState[], seeds = 40) => {
      let n = 0
      for (let i = 1; i <= seeds; i++) n += planLesson(verses, T0, seeded(i), undefined, recent).filter((s) => s.kind === 'whereWritten').length
      return n
    }
    const john = [verseIn('jhn', 10, 1), verseIn('jhn', 10, 2)]
    const johnLearning = [verseIn('jhn', 10, 1, { strength: 1, stage: 1, nextReviewAt: T0 + DAY })]
    expect(whereCount(john)).toBe(0)
    expect(whereCount(johnLearning)).toBe(0)
    expect(whereCount([verseIn('rom', 8, 1), verseIn('rom', 8, 2)])).toBeGreaterThan(0)
  })

  it('внутри одного урока вопросы про ту же книгу не повторяются много раз', () => {
    for (let i = 1; i <= 40; i++) {
      const steps = planLesson([verseIn('jhn', 10, 1), verseIn('jhn', 10, 2)], T0, seeded(i), undefined, { recentWhere: [] })
      expect(steps.filter((s) => s.kind === 'whereWritten').length).toBeLessThanOrEqual(2)
    }
  })
})

describe('выборка с весами', () => {
  it('без повторов, не больше k, вес 0 попадает в конец', () => {
    const r = weightedSample([1, 2, 3, 4], (n) => (n === 4 ? 0 : 10), 3, seeded(1))
    expect(new Set(r).size).toBe(3)
    expect(r).not.toContain(4)
  })

  it('тяжёлые элементы выбираются чаще', () => {
    let heavy = 0
    for (let i = 0; i < 200; i++) if (weightedSample(['a', 'b'], (x) => (x === 'a' ? 9 : 1), 1, seeded(i + 1))[0] === 'a') heavy++
    expect(heavy).toBeGreaterThan(140)
  })
})

describe('сложность упражнений', () => {
  const step = (kind: LessonStep['kind'], settings: LessonStep['settings']): LessonStep => ({ id: 'x', kind, verseKeys: ['k'], settings })
  it('первые буквы: слова видны — 1, иначе — 2; ввод по памяти: с подсказкой — 2, с чистого листа — 3', () => {
    expect(stepTier(step('firstLetters', { hintLevel: 1 }))).toBe(1)
    expect(stepTier(step('firstLetters', { hintLevel: 2 }))).toBe(2)
    expect(stepTier(step('firstLetters', { hintLevel: 3 }))).toBe(2)
    expect(stepTier(step('typing', { visiblePct: 35 }))).toBe(2)
    expect(stepTier(step('typing', { visiblePct: 0 }))).toBe(3)
    expect(stepTier(step('typing', {}))).toBe(3)
  })
})

describe('слова, показанные заранее', () => {
  const words = flattenWords('Раз — два три четыре пять шесть семь восемь девять десять')
  it('нужная доля слов с буквами, слова без букв всегда видны', () => {
    const visible = pickVisibleWords(words, 40, seeded(3))
    expect(visible[1]).toBe(true) // тире
    const letters = words.filter((_, i) => i !== 1)
    const shown = letters.filter((_, i) => visible[i >= 1 ? i + 1 : i]).length
    expect(shown).toBe(Math.round(letters.length * 0.4))
    expect(pickVisibleWords(words, 0, seeded(1)).filter(Boolean)).toHaveLength(1)
    expect(pickVisibleWords(words, 100, seeded(1)).every(Boolean)).toBe(true)
  })
})

describe('ползунки скрытого текста', () => {
  const words = flattenWords(TEXT)
  const ranks = makeRanks(words, seeded(1))
  const hiddenOf = (w: number, l: number) =>
    applySliderMask(words, ranks, w, l).map((m, i) => (m === null ? '' : `${i}:${m}`)).filter(Boolean)

  it('0 и 0 — текст виден целиком', () => {
    expect(applySliderMask(words, ranks, 0, 0).every((m) => m === null)).toBe(true)
  })

  it('слова скрываются целиком, до половины', () => {
    const mask = applySliderMask(words, ranks, 50, 0)
    expect(mask.filter(Boolean)).toHaveLength(Math.round(words.length / 2))
    mask.forEach((m) => m && expect(m).toMatch(/^_+$/))
  })

  it('100% букв оставляет только первые буквы', () => {
    const mask = applySliderMask(words, ranks, 0, 100)
    mask.forEach((m, i) => {
      if (!m) return
      expect(m[0]).toBe(words[i].core[0])
      expect(m.slice(1)).toMatch(/^_*$/)
    })
  })

  it('при движении ползунка скрытое только добавляется', () => {
    const a = new Set(hiddenOf(20, 30).map((s) => s.split(':')[0]))
    const b = new Set(hiddenOf(40, 60).map((s) => s.split(':')[0]))
    for (const x of a) expect(b.has(x)).toBe(true)
  })
})

describe('пропуски в стихе', () => {
  const words = flattenWords(TEXT)
  const pool = flattenWords(`${TEXT}. Блаженны плачущие, ибо они утешатся. Блаженны кроткие, ибо они наследуют землю.`)

  it('ответ среди вариантов, пропуски не рядом, число вариантов соблюдается', () => {
    const gaps = buildVerseGaps(words, pool, 2, 4, seeded(5))
    expect(gaps).toHaveLength(2)
    gaps.forEach((g) => {
      expect(g.options).toContain(g.answer)
      expect(g.options).toHaveLength(4)
      expect(new Set(g.options.map((o) => o.toLowerCase())).size).toBe(4)
    })
    expect(Math.abs(gaps[0].wordIndex - gaps[1].wordIndex)).toBeGreaterThan(1)
  })

  it('варианты от ИИ используются, а слова с ними выбираются в первую очередь', () => {
    const ai = new Map<number, string[]>([
      [1, ['кроткие', 'чистые', 'плачущие']],
      [4, ['помилуют', 'спасены', 'утешены']],
    ])
    const gaps = buildVerseGaps(words, pool, 2, 4, seeded(7), ai)
    expect(gaps.map((g) => g.wordIndex)).toEqual([1, 4])
    expect([...gaps[0].options].sort()).toEqual(['кроткие', 'милостивые', 'плачущие', 'чистые'])
    expect([...gaps[1].options].sort()).toEqual(['помилованы', 'помилуют', 'спасены', 'утешены'])
  })

  it('если вариантов от ИИ мало, недостающие добираются из слов главы', () => {
    const [gap] = buildVerseGaps(words, pool, 1, 4, seeded(2), new Map([[1, ['кроткие']]]))
    expect(gap.wordIndex).toBe(1)
    expect(gap.options).toHaveLength(4)
    expect(gap.options).toContain('кроткие')
    expect(gap.options).toContain('милостивые')
    expect(new Set(gap.options.map((o) => o.toLowerCase())).size).toBe(4)
  })

  it('нет вариантов — нет пропуска', () => {
    expect(buildVerseGaps(flattenWords('да'), flattenWords('да'), 1, 3)).toEqual([])
  })
})

describe('вопросы «где написано»', () => {
  const v = { book: 'mat', chapter: 5, verse: 7, bookChapters: 28, chapterVerses: 48 }

  it('число вопросов зависит от уровня; правильный ответ среди вариантов', () => {
    for (const levels of [1, 2, 3] as const) {
      const qs = buildWhereQuestions(v, levels, seeded(levels))
      expect(qs).toHaveLength(levels)
      qs.forEach((q) => expect(q.options.map((o) => o.value)).toContain(q.answer))
    }
  })

  it('варианты книг: 4 разные, в порядке Библии', () => {
    const books = nearBooks('mat', seeded(4))
    expect(books).toHaveLength(4)
    expect(new Set(books.map((b) => b.value)).size).toBe(4)
  })

  it('числа рядом с правильным, по возрастанию, без повторов', () => {
    const nums = nearNumbers(5, 28, 5, seeded(1))
    expect(nums).toHaveLength(5)
    expect(nums).toContain(5)
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    expect(Math.max(...nums) - Math.min(...nums)).toBeLessThanOrEqual(14)
  })

  it('правильный номер не жмётся к середине: он бывает на любом месте среди пяти вариантов', () => {
    const ranks = [0, 0, 0, 0, 0]
    const runs = 500
    for (let i = 1; i <= runs; i++) {
      const nums = nearNumbers(25, 50, 5, seeded(i))
      ranks[nums.indexOf(25)]++
    }
    ranks.forEach((n) => expect(n / runs).toBeGreaterThan(0.1))
    expect(ranks[2] / runs).toBeLessThan(0.3)
  })

  it('варианты номеров не всегда идут подряд, и у края книги они остаются в её пределах', () => {
    let gaps = 0
    for (let i = 1; i <= 100; i++) {
      const nums = nearNumbers(2, 7, 5, seeded(i))
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(1)
      expect(Math.max(...nums)).toBeLessThanOrEqual(7)
      expect(new Set(nums).size).toBe(nums.length)
      if (nums.some((n, k) => k > 0 && n - nums[k - 1] > 1)) gaps++
    }
    expect(gaps).toBeGreaterThan(0)
  })

  it('вопрос пропускается, если выбирать не из чего', () => {
    const one = { book: 'oba', chapter: 1, verse: 3, bookChapters: 1, chapterVerses: 1 }
    expect(buildWhereQuestions(one, 3, seeded(1)).map((q) => q.field)).toEqual(['book'])
  })
})

describe('разбиение на части', () => {
  const text = 'Блаженны милостивые, ибо они помилованы будут; блаженны чистые сердцем, ибо они Бога узрят'

  it('части склеиваются обратно в исходный текст', () => {
    for (const n of [2, 4, 6, 9]) {
      const parts = splitIntoPieces(text, n)
      expect(parts.join(' ')).toBe(text)
      expect(parts.length).toBeLessThanOrEqual(n)
      expect(parts.length).toBeGreaterThan(1)
    }
  })

  it('слов меньше, чем частей, — каждое слово отдельно', () => {
    expect(splitIntoPieces('Господь пастырь мой', 10)).toEqual(['Господь', 'пастырь', 'мой'])
  })

  it('разбивает по знакам препинания, если они есть рядом с серединой', () => {
    expect(splitIntoPieces(text, 2)[0].endsWith(';')).toBe(true)
  })
})


describe('план урока', () => {
  it('новый стих: знакомство, затем три несложных упражнения в свободном порядке', () => {
    const orders = new Set<string>()
    for (let i = 1; i <= 30; i++) {
      const steps = planLesson([verse(1)], T0, seeded(i))
      expect(kinds(steps).slice(0, 2)).toEqual(['reveal', 'partial'])
      const practice = steps.slice(2)
      expect(practice).toHaveLength(3) // ввода по памяти нет: стих ещё новый
      practice.forEach((s) => expect(['fillGaps', 'assemble', 'whereWritten', 'firstLetters']).toContain(s.kind))
      practice.forEach((s) => {
        if (s.kind === 'assemble') expect(s.settings.pieces).toBe(4)
        if (s.kind === 'whereWritten') expect(s.settings.levels).toBe(1)
        if (s.kind === 'firstLetters') expect(s.settings.hintLevel).toBe(1)
      })
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
      orders.add(kinds(practice).join())
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('несколько новых стихов: сначала знакомство со всеми по порядку, потом упражнения вперемешку', () => {
    const steps = planLesson([verse(2), verse(1)], T0, seeded(4))
    expect(steps.slice(0, 4).map((s) => `${s.kind}:${s.verseKeys[0].slice(-1)}`)).toEqual(['reveal:1', 'partial:1', 'reveal:2', 'partial:2'])
    const practice = steps.slice(4)
    expect(practice).toHaveLength(6)
    expect(new Set(practice.map((s) => s.verseKeys[0]))).toEqual(new Set(['rst:mat:5:1', 'rst:mat:5:2']))
  })

  it('повторение: «главное» упражнение последним (перед вводом по памяти), его сложности хватает для роста силы', () => {
    const gates = (strength: number) => {
      const found = new Set<string>()
      for (let i = 1; i <= 40; i++) {
        const steps = withoutTyping(planLesson([verse(1, { strength, stage: 1, nextReviewAt: T0 + 5 * DAY })], T0, seeded(i)))
        const gate = steps[steps.length - 1]
        found.add(gate.kind + (gate.kind === 'firstLetters' ? `:${gate.settings.hintLevel}` : gate.kind === 'assemble' ? `:${gate.settings.pieces}` : ''))
      }
      return [...found].sort()
    }
    expect(gates(1)).toEqual(['fillGaps'])
    expect(gates(2)).toEqual(['assemble:6', 'firstLetters:2'])
    expect(gates(3)).toEqual(['assemble:9', 'firstLetters:3'])
    expect(gates(5)).toEqual(['fillGaps', 'firstLetters:3'])
  })

  it('«главные» упражнения для роста силы с 2 по 4 имеют сложность 2, для роста с 0–1 — 1', () => {
    const tierOfGate = (strength: number) => {
      const tiers = new Set<number | null>()
      for (let i = 1; i <= 40; i++) {
        const steps = withoutTyping(planLesson([verse(1, { strength, stage: 1, nextReviewAt: T0 + 5 * DAY })], T0, seeded(i)))
        tiers.add(stepTier(steps[steps.length - 1]))
      }
      return [...tiers]
    }
    expect(tierOfGate(1)).toEqual([1])
    expect(tierOfGate(2)).toEqual([2])
    expect(tierOfGate(3)).toEqual([2])
  })

  it('стиху, которому подошёл срок, достаётся больше упражнений', () => {
    const notDue = withoutTyping(planLesson([verse(1, { strength: 3, stage: 3, nextReviewAt: T0 + 3 * DAY })], T0, seeded(3)))
    const due = withoutTyping(planLesson([verse(1, { strength: 3, stage: 3, nextReviewAt: T0 - DAY })], T0, seeded(3)))
    expect(notDue).toHaveLength(2)
    expect(due).toHaveLength(3)
  })

  it('если рядом учатся соседние стихи, на сильных стихах иногда предлагается «Расставьте части»', () => {
    const verses = [
      verse(7, { strength: 3, nextReviewAt: T0 - DAY }),
      verse(8, { strength: 1, nextReviewAt: T0 + 5 * DAY }),
      verse(9, { strength: 2, nextReviewAt: T0 + 5 * DAY }),
      verse(10, { strength: 0 }),
    ]
    expect(followingVerses(verses[0], verses).map((v) => v.verse)).toEqual([8, 9])
    const found: LessonStep[] = []
    for (let i = 1; i <= 40; i++) {
      found.push(...planLesson(verses.slice(0, 3), T0, seeded(i)).filter((s) => s.kind === 'orderParts'))
    }
    expect(found.length).toBeGreaterThan(0)
    found.forEach((s) => expect(s.verseKeys).toEqual(['rst:mat:5:7', 'rst:mat:5:8', 'rst:mat:5:9']))
  })

  it('сложность растёт с силой стиха', () => {
    expect(partialSettings(0).wordPct!).toBeLessThan(partialSettings(5).wordPct!)
    expect(partialSettings(6).wordPct).toBe(50)
    expect(partialSettings(6).letterPct!).toBeLessThanOrEqual(100)
    expect(gapSettings(0).blanks).toBe(2)
    expect(gapSettings(6).options).toBe(5)
    const blanks = [0, 2, 3, 5, 6].map((s) => gapSettings(s).blanks!)
    expect([...blanks].sort((a, b) => a - b)).toEqual(blanks) // чем сильнее стих, тем больше пропусков
    expect(blanks[4]).toBeGreaterThanOrEqual(7)
  })

  it('без стихов урока нет', () => {
    expect(planLesson([], T0)).toEqual([])
  })

  it('повтор урока ограничивается теми же стихами', () => {
    const verses = [verse(1), verse(2), verse(3, { strength: 3, stage: 2, nextReviewAt: T0 + DAY }), verse(7, { strength: 4 }), verse(8, { strength: 4 })]
    const only = new Set(['rst:mat:5:2', 'rst:mat:5:8'])
    for (let i = 1; i <= 20; i++) {
      planLesson(verses, T0, seeded(i), only).forEach((s) => s.verseKeys.forEach((k) => expect(only.has(k)).toBe(true)))
    }
  })
})

describe('ввод по памяти внутри урока', () => {
  const learning = (n: number, strength: number) => verse(n, { strength, stage: 2, nextReviewAt: T0 + 5 * DAY })
  const typingOf = (steps: LessonStep[]) => steps.filter((s) => s.kind === 'typing')

  it('ровно один раз за урок и в самом конце', () => {
    const verses = [learning(7, 3), learning(8, 4), learning(20, 2), verse(30)]
    for (let i = 1; i <= 40; i++) {
      const steps = planLesson(verses, T0, seeded(i))
      expect(typingOf(steps)).toHaveLength(1)
      expect(steps[steps.length - 1].kind).toBe('typing')
    }
  })

  it('его нет, пока нет стихов, которые можно вводить (сила ниже 2)', () => {
    expect(typingOf(planLesson([verse(1), verse(2, { strength: 1, stage: 1, nextReviewAt: T0 + DAY })], T0, seeded(1)))).toEqual([])
  })

  it('иногда один стих, иногда два, иногда три подряд из одной главы', () => {
    const verses = [learning(7, 3), learning(8, 3), learning(9, 3), learning(10, 3)]
    const counts = new Set<number>()
    for (let i = 1; i <= 100; i++) {
      const [typing] = typingOf(planLesson(verses, T0, seeded(i)))
      counts.add(typing.verseKeys.length)
      const numbers = typing.verseKeys.map((k) => Number(k.split(':')[3]))
      numbers.forEach((n, idx) => idx > 0 && expect(n).toBe(numbers[idx - 1] + 1)) // подряд, по возрастанию
    }
    expect([...counts].sort()).toEqual([1, 2, 3])
  })

  it('соседние стихи с силой ниже 2 в ввод по памяти не попадают', () => {
    const verses = [learning(7, 3), verse(8, { strength: 1, stage: 1, nextReviewAt: T0 + DAY })]
    for (let i = 1; i <= 40; i++) {
      const [typing] = typingOf(planLesson(verses, T0, seeded(i)))
      expect(typing.verseKeys).toEqual(['rst:mat:5:7'])
    }
  })

  it('чем слабее стих и чем больше стихов подряд, тем меньше слов подсказано; с силы 4 — чистый лист', () => {
    expect([[2, 1], [3, 1], [4, 1], [5, 1]].map(([s, c]) => typingVisiblePct(s, c))).toEqual([60, 35, 0, 0])
    expect([2, 3].map((s) => typingVisiblePct(s, 2))).toEqual([36, 21])
    expect([2, 3].map((s) => typingVisiblePct(s, 3))).toEqual([21, 12])
    expect(typingVisiblePct(4, 3)).toBe(0)
    expect(typingVisiblePct(2, 3)).toBeLessThan(typingVisiblePct(2, 2))
    expect(typingVisiblePct(2, 2)).toBeLessThan(typingVisiblePct(2, 1))
  })

  it('сложность для роста силы: с подсказками — 2, с чистого листа — 3', () => {
    const typing = (strength: number) => planLesson([learning(7, strength)], T0, seeded(1)).filter((s) => s.kind === 'typing')[0]
    expect(typing(3).settings.visiblePct).toBe(35)
    expect(stepTier(typing(3))).toBe(2)
    expect(typing(4).settings.visiblePct).toBe(0)
    expect(stepTier(typing(4))).toBe(3)
  })

  it('число стихов выбирается: чаще один, реже три', () => {
    const counts = [1, 2, 3].map(() => 0)
    for (let i = 1; i <= 300; i++) counts[pickTypingCount(seeded(i)) - 1]++
    expect(counts[0]).toBeGreaterThan(counts[1])
    expect(counts[1]).toBeGreaterThan(counts[2])
    expect(counts[2]).toBeGreaterThan(0)
  })
})

describe('стихи высшего уровня попадаются редко', () => {
  const top = (n: number, nextReviewAt: number) => verse(n, { strength: 6, stage: 4, nextReviewAt })
  const weak = (n: number) => verse(n, { strength: 2, stage: 1, nextReviewAt: T0 + DAY })

  it('пока есть слабые стихи, сильный без срока сегодня в урок не берётся', () => {
    const verses = [top(1, T0 + 5 * DAY), top(2, T0 + 9 * DAY), weak(10), weak(11)]
    expect(isTop(verses[0])).toBe(true)
    expect(lessonPool(verses, T0).map((v) => v.verse)).toEqual([10, 11])
    for (let i = 1; i <= 40; i++) {
      planLesson(verses, T0, seeded(i)).forEach((s) => s.verseKeys.forEach((k) => expect(['rst:mat:5:10', 'rst:mat:5:11']).toContain(k)))
    }
  })

  it('сильный стих, которому пора повторяться (или пора было раньше), попадает в урок, но с малым числом упражнений', () => {
    const verses = [top(1, T0 - 3 * DAY), weak(10), weak(11)]
    expect(lessonPool(verses, T0).map((v) => v.verse)).toEqual([1, 10, 11])
    for (let i = 1; i <= 40; i++) {
      const own = withoutTyping(planLesson(verses, T0, seeded(i))).filter((s) => s.verseKeys.length === 1 && s.verseKeys[0] === 'rst:mat:5:1')
      expect(own.length).toBe(2)
    }
  })

  it('если слабых стихов не осталось, берутся все, но стих, которому пора повторяться, попадает обязательно', () => {
    const verses = [
      top(1, T0 + 8 * DAY), top(2, T0 - DAY), top(3, T0 + 9 * DAY),
      top(4, T0 + 12 * DAY), verse(5, { strength: 7, stage: 4, nextReviewAt: T0 + 20 * DAY }),
    ]
    expect(lessonPool(verses, T0)).toHaveLength(5)
    const picked = pickVerses(verses, T0).map((v) => v.verse)
    expect(picked).toContain(2)
    expect(picked.length).toBeLessThanOrEqual(3)
  })

  it('после того как сильный стих повторён и срок ушёл вперёд, он снова исчезает из уроков', () => {
    const verses = [top(1, T0 + 14 * DAY), weak(10)]
    expect(lessonPool(verses, T0).map((v) => v.verse)).toEqual([10])
  })
})
