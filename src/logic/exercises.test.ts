import { describe, expect, it } from 'vitest'
import {
  flattenWords, groupLines, judgeTyped, sameOrderText, scoreOrder, shuffleBlocks, splitIntoPieces, visibleMask,
} from './exercises'

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = `Я помню чудное мгновенье:
Передо мной явилась ты,
Как мимолетное виденье,
Как гений чистой красоты.

В томленьях грусти безнадежной,
В тревогах шумной суеты,
Звучал мне долго голос нежный
И снились милые черты.`

describe('порядок частей', () => {
  it('перемешивание отличается от исходного порядка', () => {
    const blocks = splitIntoPieces(TEXT, 4)
    const order = shuffleBlocks(blocks, seeded(5))
    expect(order).not.toEqual([0, 1, 2, 3])
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })

  it('верный итоговый текст засчитывается, даже если части стоят иначе', () => {
    const correct = ['Вор приходит только', 'для того,', 'чтобы украсть;', 'я пришёл', 'для', 'того,', 'чтобы имели жизнь']
    // «для того,» и «для» + «того,» поменялись местами, а текст получился тот же
    const swapped = ['Вор приходит только', 'для', 'того,', 'чтобы украсть;', 'я пришёл', 'для того,', 'чтобы имели жизнь']
    expect(sameOrderText(swapped, correct)).toBe(true)
    expect(scoreOrder(swapped, correct)).toBe(100)
    expect(scoreOrder([...swapped].reverse(), correct)).toBeLessThan(100)
  })

  it('оценка по позициям', () => {
    expect(scoreOrder(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(100)
    expect(scoreOrder(['b', 'a', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(50)
  })
})

describe('visibleMask', () => {
  it('лёгкая — все видны, тяжёлая — только слова без букв', () => {
    const words = flattenWords('Раз — два три')
    expect(visibleMask(words, 1).every(Boolean)).toBe(true)
    expect(visibleMask(words, 3)).toEqual([false, true, false, false])
  })
})

describe('judgeTyped', () => {
  it('засчитывает слово по совпадению, пробелу или длине', () => {
    expect(judgeTyped('Тебе', 'тебе')).toBe('ok')
    expect(judgeTyped('ёж', 'еж')).toBe('ok')
    expect(judgeTyped('теб', 'тебе')).toBe('wait')
    expect(judgeTyped('теб ', 'тебе')).toBe('bad')
    expect(judgeTyped('тебя', 'тебе')).toBe('bad')
    expect(judgeTyped('тебе,', 'тебе')).toBe('ok')
    expect(judgeTyped('   ', 'тебе')).toBe('wait')
  })
})

describe('строки', () => {
  it('группирует слова по строкам', () => {
    const spans = groupLines(flattenWords(TEXT))
    expect(spans.length).toBe(8)
    expect(spans[4].blankBefore).toBe(true)
  })
})
