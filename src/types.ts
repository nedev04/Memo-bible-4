/** Сложность «Первых букв»: 1 — слова видны, 2 — видны не все, 3 — видны только пробелы */
export type Difficulty = 1 | 2 | 3

/** Состояние запоминания одного стиха. Ключ: rst:mat:5:7 */
export interface VerseState {
  key: string
  translation: string
  book: string
  chapter: number
  verse: number
  addedAt: number
  /** Сила запоминания 0–7: насколько хорошо стих знают сейчас; 0 — стих только добавлен, 7 — выучен */
  strength: number
  /** Стадия повторения 0–6: число пройденных циклов; циклы приходятся на дни 0, 1, 3, 7, 14, 30, 60 */
  stage: number
  nextReviewAt: number
  /** Когда сила росла в последний раз */
  lastUpAt: number | null
  lastPracticedAt: number | null
  /** Результат последнего упражнения по этому стиху, 0–100 */
  lastScore: number | null
  /** Сколько раз стадия падала */
  lapses: number
  updatedAt: number
  deletedAt?: number | null
  dirty?: 0 | 1
}

/** Запись о результате упражнения по стиху (журнал для опыта; только добавляется) */
export interface VerseReview {
  id?: number
  uid: string
  verseKey: string
  /** Код упражнения */
  exercise: string
  /** Сложность упражнения 1–3 */
  tier: 1 | 2 | 3
  score: number
  xp: number
  createdAt: number
  dirty?: 0 | 1
}

/** Сохранённые на устройстве варианты ответов от ИИ для одного стиха (id: ключ стиха и хэш его текста) */
export interface GapCacheRow {
  id: string
  /** Номер слова в стихе → неверные варианты */
  items: Record<number, string[]>
  savedAt: number
}

/** Пройденный урок. Содержимое не хранится: урок собирается заново, когда его начинают или повторяют. */
export interface LessonRecord {
  id?: number
  uid: string
  /** Стихи, по которым был урок (нужны, чтобы повторить его позже) */
  verseKeys: string[]
  xp: number
  mistakes: number
  createdAt: number
  dirty?: 0 | 1
}
