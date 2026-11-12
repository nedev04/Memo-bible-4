import type { Tier } from '../logic/mastery'

export type ExerciseKind = 'reveal' | 'partial' | 'fillGaps' | 'assemble' | 'whereWritten' | 'orderParts' | 'typing' | 'firstLetters'


export const KIND_TITLE: Record<ExerciseKind, string> = {
  reveal: 'Откройте стих по частям',
  partial: 'Прочитайте стих',
  fillGaps: 'Выберите пропущенное слово',
  assemble: 'Соберите стих в правильном порядке',
  whereWritten: 'Где это написано?',
  orderParts: 'Расставьте части по порядку',
  typing: 'Введите по памяти',
  firstLetters: 'Введите первые буквы слов',
}

/** В заголовке упражнения нельзя показывать ссылку, если она и есть ответ */
export const KIND_SHOWS_REF: Record<ExerciseKind, boolean> = {
  reveal: true, partial: true, fillGaps: true, assemble: true, whereWritten: false, orderParts: true, typing: true, firstLetters: true,
}

/**
 * Сложность упражнения для правил запоминания. null — учебное упражнение: оно знакомит со стихом,
 * но не проверяет его, поэтому на силу стиха не влияет.
 */
export function stepTier(step: LessonStep): Tier | null {
  switch (step.kind) {
    case 'reveal':
    case 'partial':
      return null
    case 'fillGaps':
      return 1
    case 'whereWritten':
      return (step.settings.levels ?? 1) >= 3 ? 2 : 1
    case 'assemble':
      return (step.settings.pieces ?? 6) <= 4 ? 1 : 2
    case 'orderParts':
      return 2
    case 'typing':
      // Ввод по памяти с чистого листа — вспоминание без подсказок; если часть слов показана, это вспоминание с опорой
      return (step.settings.visiblePct ?? 0) > 0 ? 2 : 3
    case 'firstLetters':
      // Слова видны целиком — узнавание; видны частично или не видны — вспоминание с опорой
      return (step.settings.hintLevel ?? 1) <= 1 ? 1 : 2
  }
}

export interface StepSettings {
  /** Сколько слов открывается за одно касание */
  chunk?: number
  /** Доля скрытых слов, % (0–50) */
  wordPct?: number
  /** Доля скрытых букв в остальных словах, % (0–100) */
  letterPct?: number
  /** Сколько пропусков */
  blanks?: number
  /** Сколько вариантов ответа */
  options?: number
  /** На сколько частей разбивается стих при сборке */
  pieces?: number
  /** Сколько вопросов «где написано»: 1 — книга, 2 — и глава, 3 — и стих */
  levels?: 1 | 2 | 3
  /** Первые буквы: 1 — слова видны, 2 — видны не все, 3 — видны только пробелы */
  hintLevel?: 1 | 2 | 3
  /** Ввод по памяти: сколько процентов слов уже стоит на месте (0 — чистый лист) */
  visiblePct?: number
}

export interface LessonStep {
  id: string
  kind: ExerciseKind
  verseKeys: string[]
  settings: StepSettings
  /** Повтор после ошибки в конце урока */
  retry?: boolean
}

/** Стих с текстом, готовый к показу */
export interface VerseText {
  key: string
  book: string
  chapter: number
  verse: number
  /** «Матфея 5:7» */
  ref: string
  text: string
  /** Текст всей главы: из него берутся неверные варианты ответа */
  chapterText: string
  /** Сколько глав в книге и сколько стихов в этой главе (для вопросов «где написано») */
  bookChapters: number
  chapterVerses: number
  /** Варианты ответов от ИИ для пропущенных слов: номер слова в стихе → неверные варианты (если удалось получить) */
  aiGaps?: Record<number, string[]>
}

export interface StepResult {
  /** Точность 0–100 */
  score: number
  /** Учебное упражнение: без оценки, урок идёт дальше сразу */
  neutral?: boolean
  /** Пояснение под оценкой, например правильный ответ */
  detail?: string
  /** Если в шаге несколько стихов, у каждого может быть свой результат (ключ стиха → точность) */
  perVerse?: Record<string, number>
}

export interface StepOutcome {
  xp: number
  changes: { key: string; change: 'up' | 'down' | 'same' }[]
}

/** Что получает компонент упражнения */
export interface StepProps {
  /** Первый (или единственный) стих шага */
  verse: VerseText
  /** Все стихи шага: больше одного бывает в «Расставьте части» */
  verses: VerseText[]
  settings: StepSettings
  onAnswer: (result: StepResult) => void
}
