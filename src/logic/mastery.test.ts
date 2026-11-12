import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { applyVerseResult, dayStartPlus, needsAttention, strengthGroup, xpFor } from './mastery'

const T0 = new Date('2026-03-10T10:00:00').getTime()
const day = (n: number) => dayStartPlus(T0, n)

function verse(over: Partial<VerseState> = {}): VerseState {
  return {
    key: 'rst:mat:5:7', translation: 'rst', book: 'mat', chapter: 5, verse: 7,
    addedAt: T0, strength: 0, stage: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0,
    ...over,
  }
}

describe('сила растёт без привязки к дню', () => {
  it('несколько зачётов подряд поднимают силу до 6, пока упражнения достаточно сложные', () => {
    let v = verse()
    const steps: [1 | 2 | 3, number][] = [[1, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6], [3, 6]]
    for (const [tier, expected] of steps) {
      v = applyVerseResult(v, { tier, score: 100 }, T0).verse
      expect(v.strength).toBe(expected)
    }
  })

  it('лёгкие упражнения не поднимают выше нужной планки', () => {
    const at = (strength: number, tier: 1 | 2 | 3) =>
      applyVerseResult(verse({ strength, stage: 1, nextReviewAt: day(5) }), { tier, score: 100 }, T0)
    expect(at(1, 1).change).toBe('up')
    expect(at(2, 1).change).toBe('same')
    expect(at(2, 2).change).toBe('up')
    expect(at(4, 2).change).toBe('same')
    expect(at(4, 3).verse.strength).toBe(5)
  })

  it('ошибка снижает силу на 1 (ниже 40% — на 2), но не ниже 1', () => {
    const fail = (strength: number, score: number) =>
      applyVerseResult(verse({ strength, stage: 2, nextReviewAt: day(3) }), { tier: 2, score }, T0).verse.strength
    expect(fail(4, 50)).toBe(3)
    expect(fail(5, 10)).toBe(3)
    expect(fail(2, 10)).toBe(1)
    expect(fail(7, 50)).toBe(6)
  })
})

describe('циклы повторения', () => {
  it('первый зачёт: второй цикл — завтра, с начала дня', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 100 }, T0)
    expect(r.verse.stage).toBe(1)
    expect(r.verse.nextReviewAt).toBe(day(1))
    // вечером изученный стих утром следующего дня уже к повторению
    expect(applyVerseResult(verse(), { tier: 1, score: 100 }, day(0) + 23 * 3600000).verse.nextReviewAt).toBe(day(1))
  })

  it('следующие зачёты в тот же день расписание не двигают', () => {
    const first = applyVerseResult(verse(), { tier: 1, score: 100 }, T0).verse
    const second = applyVerseResult(first, { tier: 1, score: 100 }, T0 + 1000).verse
    expect(second.stage).toBe(1)
    expect(second.nextReviewAt).toBe(day(1))
    expect(second.strength).toBe(2)
  })

  it('без пропусков циклы приходятся на дни 0, 1, 3, 7, 14, 30, 60, затем раз в 60 дней', () => {
    let v = applyVerseResult(verse(), { tier: 1, score: 100 }, T0).verse
    const expectedDays = [1, 3, 7, 14, 30, 60]
    const stages = [1, 2, 3, 4, 5, 6]
    expect(v.nextReviewAt).toBe(day(1))
    expectedDays.forEach((d, i) => {
      const when = v.nextReviewAt + 10 * 3600000 // днём в назначенный день
      expect(when >= day(d) && when < day(d + 1)).toBe(true)
      v = applyVerseResult(v, { tier: 3, score: 100 }, when).verse
      expect(v.stage).toBe(Math.min(6, stages[i] + 1))
      if (i < expectedDays.length - 1) expect(v.nextReviewAt).toBe(dayStartPlus(when, [2, 4, 7, 16, 30][i]))
    })
    expect(v.stage).toBe(6)
  })

  it('пропуск сдвигает все последующие циклы: второй цикл на день позже — и третий на день позже', () => {
    let v = applyVerseResult(verse(), { tier: 1, score: 100 }, T0).verse // цикл 1 в день 0, цикл 2 назначен на день 1
    v = applyVerseResult(v, { tier: 2, score: 100 }, day(2) + 3600000).verse // пользователь пришёл в день 2
    expect(v.stage).toBe(2)
    expect(v.nextReviewAt).toBe(day(4)) // вместо дня 3
    v = applyVerseResult(v, { tier: 2, score: 100 }, day(4) + 3600000).verse
    expect(v.stage).toBe(3)
    expect(v.nextReviewAt).toBe(day(8)) // вместо дня 7
  })

  it('недостаточно сложное упражнение не засчитывает цикл: стих остаётся к повторению', () => {
    const due = verse({ strength: 4, stage: 3, nextReviewAt: T0 })
    const easy = applyVerseResult(due, { tier: 1, score: 100 }, T0).verse
    expect(easy.stage).toBe(3)
    expect(easy.nextReviewAt).toBe(T0)
    const hard = applyVerseResult(easy, { tier: 2, score: 100 }, T0).verse
    expect(hard.stage).toBe(4)
    expect(hard.nextReviewAt).toBe(day(7))
  })

  it('до срока зачёт расписание не меняет', () => {
    const r = applyVerseResult(verse({ strength: 3, stage: 3, nextReviewAt: day(7) }), { tier: 3, score: 100 }, T0)
    expect(r.verse.stage).toBe(3)
    expect(r.verse.nextReviewAt).toBe(day(7))
  })

  it('ошибка в срок снижает стадию и возвращает стих на завтра', () => {
    const r = applyVerseResult(verse({ strength: 4, stage: 4, nextReviewAt: T0 }), { tier: 3, score: 50 }, day(8) + 3600000)
    expect(r.change).toBe('down')
    expect(r.verse.stage).toBe(3)
    expect(r.verse.lapses).toBe(1)
    expect(r.verse.nextReviewAt).toBe(day(9))
    expect(applyVerseResult(verse({ strength: 5, stage: 5, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.stage).toBe(3)
    expect(applyVerseResult(verse({ strength: 2, stage: 1, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.stage).toBe(1)
  })

  it('ошибка до срока стадию не меняет, но стих вернётся не позже чем завтра', () => {
    const r = applyVerseResult(verse({ strength: 4, stage: 4, nextReviewAt: day(14) }), { tier: 2, score: 40 }, T0)
    expect(r.verse.stage).toBe(4)
    expect(r.verse.nextReviewAt).toBe(day(1))
    expect(needsAttention(r.verse)).toBe(true)
  })

  it('результат 70–89% в срок: повтор через половину интервала, стадия прежняя', () => {
    const r = applyVerseResult(verse({ strength: 3, stage: 3, nextReviewAt: T0 }), { tier: 2, score: 80 }, T0)
    expect(r.verse.stage).toBe(3)
    expect(r.verse.nextReviewAt).toBe(day(2)) // половина от 4 дней
  })

  it('новый стих, который не получился, остаётся к изучению', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 30 }, T0 + 5000)
    expect(r.verse.strength).toBe(0)
    expect(r.verse.stage).toBe(0)
    expect(r.verse.nextReviewAt).toBe(T0 + 5000)
  })
})

describe('седьмой уровень «выучено»', () => {
  it('даётся на четвёртом цикле, если сила уже 6', () => {
    // цикл 4 проходится при переходе со стадии 3 на стадию 4
    const r = applyVerseResult(verse({ strength: 6, stage: 3, nextReviewAt: T0 }), { tier: 3, score: 100 }, T0)
    expect(r.verse.stage).toBe(4)
    expect(r.verse.strength).toBe(7)
    expect(r.change).toBe('up')
  })

  it('не даётся раньше четвёртого цикла и при силе ниже 6', () => {
    expect(applyVerseResult(verse({ strength: 6, stage: 2, nextReviewAt: T0 }), { tier: 3, score: 100 }, T0).verse.strength).toBe(6)
    // упражнение сложности 2 силу 5 не поднимает, поэтому до 7 далеко
    expect(applyVerseResult(verse({ strength: 5, stage: 3, nextReviewAt: T0 }), { tier: 2, score: 100 }, T0).verse.strength).toBe(5)
  })

  it('если на четвёртом цикле ввод по памяти поднял силу до 6, стих сразу становится выученным', () => {
    expect(applyVerseResult(verse({ strength: 5, stage: 3, nextReviewAt: T0 }), { tier: 3, score: 100 }, T0).verse.strength).toBe(7)
  })

  it('при силе 6 и позднем цикле даётся на ближайшем успешном повторении', () => {
    const r = applyVerseResult(verse({ strength: 6, stage: 5, nextReviewAt: T0 }), { tier: 3, score: 100 }, T0)
    expect(r.verse.strength).toBe(7)
  })

  it('упражнения сами силу выше 6 не поднимают; ошибка снижает с 7 до 6', () => {
    expect(applyVerseResult(verse({ strength: 6, stage: 2, nextReviewAt: day(3) }), { tier: 3, score: 100 }, T0).verse.strength).toBe(6)
    expect(applyVerseResult(verse({ strength: 7, stage: 4, nextReviewAt: day(5) }), { tier: 3, score: 100 }, T0).verse.strength).toBe(7)
    expect(applyVerseResult(verse({ strength: 7, stage: 4, nextReviewAt: day(5) }), { tier: 3, score: 30 }, T0).verse.strength).toBe(5)
  })
})

describe('прочее', () => {
  it('группы силы', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(strengthGroup))
      .toEqual(['new', 'started', 'started', 'medium', 'medium', 'strong', 'strong', 'learned'])
  })
  it('опыт зависит от сложности и точности', () => {
    expect(xpFor(1, 100)).toBe(5)
    expect(xpFor(3, 100)).toBe(15)
    expect(xpFor(2, 50)).toBe(5)
    expect(xpFor(3, 0)).toBe(0)
  })
})
