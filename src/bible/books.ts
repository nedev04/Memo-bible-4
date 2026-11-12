import data from './books.json'
import type { BookMeta } from './types'

/** 66 книг в порядке Синодального издания (в Новом Завете сначала соборные послания, потом Павла) */
export const BOOKS = data as BookMeta[]

const byId = new Map(BOOKS.map((b, i) => [b.id, { book: b, order: i }]))

export function getBook(id: string): BookMeta | undefined {
  return byId.get(id)?.book
}

/** Позиция книги в Библии (для сортировки) */
export function bookOrder(id: string): number {
  return byId.get(id)?.order ?? Number.MAX_SAFE_INTEGER
}
