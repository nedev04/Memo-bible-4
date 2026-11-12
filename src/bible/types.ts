export type Testament = 'ot' | 'nt'

export interface BookMeta {
  /** Короткий id: gen, exo, mat … (он же имя файла с текстом) */
  id: string
  /** Номер книги в источнике (порядок протестантского канона) */
  num: number
  /** Название для ссылок: «Матфея», «1 Царств» */
  name: string
  /** Сколько глав должно быть (для проверки при сборке) */
  chapters: number
  testament: Testament
}

/** Содержимое public/bible/<перевод>/index.json */
export interface BibleIndex {
  translation: string
  name: string
  books: { id: string; /** номер последнего стиха в каждой главе */ verses: number[] }[]
}

export interface VerseRef {
  book: string
  chapter: number
  verse: number
}
