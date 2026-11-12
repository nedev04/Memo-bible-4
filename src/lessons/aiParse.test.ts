import { describe, expect, it } from 'vitest'
import { flattenWords } from '../logic/exercises'
import { parseAiItems, textHash } from './aiParse'

const words = flattenWords('Блаженны милостивые, ибо они помилованы будут')

describe('хэш текста', () => {
  it('одинаковый для одного текста, разный для разных, восемь знаков', () => {
    expect(textHash('Блаженны милостивые')).toBe(textHash('Блаженны милостивые'))
    expect(textHash('Блаженны милостивые')).not.toBe(textHash('Блаженны кроткие'))
    expect(textHash('Блаженны милостивые')).toMatch(/^[0-9a-f]{8}$/)
    expect(textHash('')).toBe('811c9dc5')
  })
})

describe('разбор ответа ИИ', () => {
  const item = (i: number, word: string, options: unknown) => ({ i, word, options })

  it('принимает верную запись и приводит регистр к регистру слова в стихе', () => {
    expect(parseAiItems([item(1, 'милостивые', [' кроткие ', 'Чистые', 'плачущие', 'нищие'])], words))
      .toEqual({ 1: ['кроткие', 'чистые', 'плачущие', 'нищие'] })
    expect(parseAiItems([item(0, 'блаженны', ['счастливы', 'радостны', 'довольны'])], words))
      .toEqual({ 0: ['Счастливы', 'Радостны', 'Довольны'] })
  })

  it('отбрасывает запись, если слово не совпадает со словом стиха или номер неверный', () => {
    expect(parseAiItems([item(1, 'другое', ['а1', 'б2', 'в3', 'г4'])], words)).toEqual({})
    expect(parseAiItems([item(99, 'милостивые', ['кроткие', 'чистые', 'плачущие'])], words)).toEqual({})
    expect(parseAiItems([item(-1, 'милостивые', ['кроткие', 'чистые', 'плачущие'])], words)).toEqual({})
  })

  it('убирает правильный ответ, повторы, несколько слов и слишком короткие варианты', () => {
    const options = ['милостивые', 'кроткие', 'два слова', 'а', 'Кроткие', 'чистые', 'плачущие']
    expect(parseAiItems([item(1, 'милостивые', options)], words)).toEqual({ 1: ['кроткие', 'чистые', 'плачущие'] })
  })

  it('нужно не меньше трёх годных вариантов; больше шести не берётся', () => {
    expect(parseAiItems([item(1, 'милостивые', ['кроткие', 'чистые'])], words)).toEqual({})
    const many = ['кроткие', 'чистые', 'плачущие', 'нищие', 'скорбящие', 'голодные', 'жаждущие', 'миротворцы']
    expect(parseAiItems([item(1, 'милостивые', many)], words)[1]).toHaveLength(6)
  })

  it('мусор на входе не ломает разбор', () => {
    expect(parseAiItems(null, words)).toEqual({})
    expect(parseAiItems({ items: [] }, words)).toEqual({})
    expect(parseAiItems([null, 5, 'x', item(1, 'милостивые', 'не список')], words)).toEqual({})
  })
})
