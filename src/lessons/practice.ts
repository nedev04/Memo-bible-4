import type { Rng } from '../logic/exercises'
import type { ExerciseKind, LessonStep, StepSettings } from './types'

export interface PracticeLevel {
  label: string
  settings: StepSettings
}

export interface PracticeOption {
  kind: ExerciseKind
  title: string
  description: string
  /** Учебные упражнения без оценки не меняют силу стихов и не дают опыта */
  scored: boolean
  levels: PracticeLevel[]
}

/** Упражнения, которые можно пройти вручную, и их варианты сложности */
export const PRACTICE_OPTIONS: PracticeOption[] = [
  {
    kind: 'reveal', title: 'Открытие по тапу', scored: false,
    description: 'Стих открывается по частям при касании.',
    levels: [{ label: 'Начать', settings: { chunk: 2 } }],
  },
  {
    kind: 'partial', title: 'Частично скрытый текст', scored: false,
    description: 'Часть слов и букв скрыта; два ползунка меняют, сколько.',
    levels: [{ label: 'Начать', settings: { wordPct: 20, letterPct: 40 } }],
  },
  {
    kind: 'fillGaps', title: 'Пропущенные слова', scored: true,
    description: 'Выбрать пропущенные слова из вариантов.',
    levels: [
      { label: '3 пропуска', settings: { blanks: 3, options: 4 } },
      { label: '5 пропусков', settings: { blanks: 5, options: 5 } },
      { label: '8 пропусков', settings: { blanks: 8, options: 5 } },
    ],
  },
  {
    kind: 'firstLetters', title: 'Первые буквы', scored: true,
    description: 'Вводить первую букву каждого слова.',
    levels: [
      { label: 'Слова видны', settings: { hintLevel: 1 } },
      { label: 'Видны не все', settings: { hintLevel: 2 } },
      { label: 'Только пробелы', settings: { hintLevel: 3 } },
    ],
  },
  {
    kind: 'assemble', title: 'Соберите стих', scored: true,
    description: 'Собрать стих из слов и фраз в правильном порядке.',
    levels: [
      { label: '4 части', settings: { pieces: 4 } },
      { label: '8 частей', settings: { pieces: 8 } },
      { label: '14 частей', settings: { pieces: 14 } },
    ],
  },
  {
    kind: 'orderParts', title: 'Расставьте части', scored: true,
    description: 'Расставить по порядку несколько стихов подряд (или части одного стиха).',
    levels: [{ label: 'Начать', settings: {} }],
  },
  {
    kind: 'whereWritten', title: 'Где написано', scored: true,
    description: 'Выбрать, где написан стих.',
    levels: [
      { label: 'Книга', settings: { levels: 1 } },
      { label: 'Книга и глава', settings: { levels: 2 } },
      { label: 'Книга, глава, стих', settings: { levels: 3 } },
    ],
  },
  {
    kind: 'typing', title: 'Ввод по памяти', scored: true,
    description: 'Ввести стих (до трёх подряд) по памяти.',
    levels: [
      { label: 'Много подсказок', settings: { visiblePct: 60 } },
      { label: 'Немного подсказок', settings: { visiblePct: 35 } },
      { label: 'Чистый лист', settings: { visiblePct: 0 } },
    ],
  },
]

/** Сколько стихов берётся для упражнений по одному стиху, для расстановки частей и для ввода по памяти */
export const MAX_PER_VERSE = 6
export const MAX_ORDER_VERSES = 5
export const MAX_TYPING_VERSES = 3

/** Подряд идущий кусок списка не длиннее size, со случайным началом, если список длиннее */
export function windowOf<T>(list: T[], size: number, rng: Rng = Math.random): T[] {
  if (list.length <= size) return list
  const start = Math.floor(rng() * (list.length - size + 1))
  return list.slice(start, start + size)
}

/**
 * Шаги тренировки по выбранным стихам (keys идут по порядку Библии, подряд).
 * Упражнения по одному стиху: по шагу на каждый стих (не больше шести); «Расставьте части» и ввод по памяти:
 * одно задание на несколько стихов подряд.
 */
export function buildPracticeSteps(
  option: PracticeOption,
  levelIndex: number,
  keys: string[],
  rng: Rng = Math.random,
): LessonStep[] {
  const settings = option.levels[Math.min(levelIndex, option.levels.length - 1)].settings
  const step = (verseKeys: string[], n: number): LessonStep => ({
    id: `${option.kind}:${verseKeys.join('+')}:${n}`,
    kind: option.kind,
    verseKeys,
    settings,
  })

  if (option.kind === 'orderParts') return [step(windowOf(keys, MAX_ORDER_VERSES, rng), 0)]
  if (option.kind === 'typing') return [step(windowOf(keys, MAX_TYPING_VERSES, rng), 0)]
  return windowOf(keys, MAX_PER_VERSE, rng).map((k, i) => step([k], i))
}
