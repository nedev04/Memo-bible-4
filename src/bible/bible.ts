import type { BibleIndex } from './types'

/** Текст Библии лежит рядом с приложением файлами по книгам и подгружается по мере надобности */
export class BibleLoadError extends Error {}

const cache = new Map<string, Promise<unknown>>()

async function getJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}bible/${path}`
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new BibleLoadError('Нет связи, а этот раздел Библии ещё не сохранён на устройстве.')
  }
  if (!res.ok) throw new BibleLoadError('Текст Библии не найден. Выполните npm run bible:build и сохраните папку public/bible.')
  try {
    return (await res.json()) as T
  } catch {
    // Хостинг может отдать страницу приложения вместо отсутствующего файла
    throw new BibleLoadError('Текст Библии не найден. Выполните npm run bible:build и сохраните папку public/bible.')
  }
}

function cached<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = getJson<T>(path)
    cache.set(path, p)
    p.catch(() => cache.delete(path)) // после ошибки можно повторить
  }
  return p
}

export const loadIndex = (translation: string) => cached<BibleIndex>(`${translation}/index.json`)

/** Глава = массив строк, индекс = номер стиха − 1; у пропущенного в издании стиха пустая строка */
export const loadBook = (translation: string, bookId: string) => cached<string[][]>(`${translation}/${bookId}.json`)

export async function verseText(translation: string, book: string, chapter: number, verse: number): Promise<string> {
  const chapters = await loadBook(translation, book)
  return chapters[chapter - 1]?.[verse - 1] ?? ''
}
