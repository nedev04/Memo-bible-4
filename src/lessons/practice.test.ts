import { describe, expect, it } from 'vitest'
import { buildPracticeSteps, MAX_PER_VERSE, PRACTICE_OPTIONS, windowOf } from './practice'

const keys = Array.from({ length: 12 }, (_, i) => `rst:psa:90:${i + 1}`)
const option = (kind: string) => PRACTICE_OPTIONS.find((o) => o.kind === kind)!

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('тренировка', () => {
  it('кусок списка идёт подряд и не длиннее размера', () => {
    for (let i = 1; i <= 30; i++) {
      const part = windowOf(keys, 5, seeded(i))
      expect(part).toHaveLength(5)
      const start = keys.indexOf(part[0])
      expect(part).toEqual(keys.slice(start, start + 5))
    }
    expect(windowOf(keys.slice(0, 3), 5)).toEqual(keys.slice(0, 3))
  })

  it('упражнения по одному стиху: шаг на каждый стих, не больше шести', () => {
    const steps = buildPracticeSteps(option('fillGaps'), 1, keys, seeded(1))
    expect(steps).toHaveLength(MAX_PER_VERSE)
    steps.forEach((s) => expect(s.verseKeys).toHaveLength(1))
    expect(steps[0].settings).toEqual({ blanks: 5, options: 5 })
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
    expect(buildPracticeSteps(option('firstLetters'), 0, keys.slice(0, 2))).toHaveLength(2)
  })

  it('«Расставьте части» и ввод по памяти — одно задание на несколько стихов подряд', () => {
    const parts = buildPracticeSteps(option('orderParts'), 0, keys, seeded(2))
    expect(parts).toHaveLength(1)
    expect(parts[0].verseKeys).toHaveLength(5)
    const typing = buildPracticeSteps(option('typing'), 2, keys, seeded(3))
    expect(typing).toHaveLength(1)
    expect(typing[0].verseKeys).toHaveLength(3)
    expect(typing[0].settings.visiblePct).toBe(0)
    expect(buildPracticeSteps(option('typing'), 0, keys.slice(0, 1))[0].verseKeys).toEqual([keys[0]])
  })

  it('номер сложности вне диапазона берёт последний вариант; учебные упражнения без оценки', () => {
    expect(buildPracticeSteps(option('reveal'), 5, keys.slice(0, 1))[0].settings).toEqual({ chunk: 2 })
    expect(option('reveal').scored).toBe(false)
    expect(option('partial').scored).toBe(false)
    expect(PRACTICE_OPTIONS.filter((o) => o.scored)).toHaveLength(6)
  })
})
