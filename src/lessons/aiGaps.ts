import { db } from '../db/db'
import { flattenWords } from '../logic/exercises'
import { supabase } from '../sync/client'
import { parseAiItems, textHash } from './aiParse'
import { loadTexts } from './loadTexts'
import type { VerseText } from './types'

/**
 * Варианты ответов от ИИ для упражнения «Пропущенные слова»: неверные слова той же формы, которые звучат в тексте естественно,
 * но не подходят. Работают только для вошедшего в облако пользователя; во всех остальных случаях (нет входа, нет сети,
 * не подключена функция) упражнение использует обычные варианты из слов главы.
 *
 * Порядок: сохранённое на устройстве → общий кэш в облаке (его заполняют все пользователи) → генерация функцией Supabase.
 * Найденные варианты кладутся в verse.aiGaps.
 */

const cacheId = (v: VerseText) => `${v.key}#${textHash(v.text)}`

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(1, ms))),
  ])
}

async function save(v: VerseText, items: Record<number, string[]>) {
  if (Object.keys(items).length === 0) return
  v.aiGaps = items
  await db.gapOptions.put({ id: cacheId(v), items, savedAt: Date.now() })
}

async function fetchShared(keys: string[]) {
  const { data, error } = await supabase!.from('verse_options').select('key, text_hash, items').in('key', keys)
  if (error) throw error
  return (data ?? []) as { key: string; text_hash: string; items: unknown }[]
}

async function generate(v: VerseText) {
  const res = await supabase!.functions.invoke('gap-options', { body: { key: v.key, text: v.text } })
  if (res.error) throw res.error
  await save(v, parseAiItems((res.data as { items?: unknown } | null)?.items, flattenWords(v.text)))
}

/** budgetMs — сколько ждать в сумме; на что времени не хватило, то упражнение заменит обычными вариантами */
export async function loadAiGaps(verses: VerseText[], budgetMs = 6000): Promise<void> {
  if (!supabase || verses.length === 0) return
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
  } catch {
    return
  }

  const deadline = Date.now() + budgetMs
  const left = () => deadline - Date.now()

  // 1. Сохранённое на устройстве
  let todo: VerseText[] = []
  for (const v of verses) {
    const cached = await db.gapOptions.get(cacheId(v)).catch(() => undefined)
    if (cached) v.aiGaps = cached.items
    else todo.push(v)
  }
  if (todo.length === 0) return

  // 2. Общий кэш в облаке
  const rows = await withTimeout(fetchShared(todo.map((v) => v.key)), left())
  if (rows) {
    for (const v of todo) {
      const hash = textHash(v.text)
      const row = rows.find((r) => r.key === v.key && r.text_hash === hash)
      if (row) await save(v, parseAiItems(row.items, flattenWords(v.text))).catch(() => {})
    }
    todo = todo.filter((v) => !v.aiGaps)
  }

  // 3. Генерация функцией (по три стиха одновременно)
  let next = 0
  const worker = async () => {
    while (next < todo.length && left() > 0) {
      const v = todo[next++]
      await withTimeout(generate(v), left())
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

/**
 * Заранее готовит варианты для только что добавленных стихов (в фоне, без ожидания), чтобы первый урок не ждал.
 * Не больше 20 стихов за раз.
 */
export async function prefetchAiGaps(keys: string[]): Promise<void> {
  try {
    const texts = await loadTexts(keys.slice(0, 20))
    await loadAiGaps([...texts.values()], 90_000)
  } catch {
    /* необязательная оптимизация */
  }
}
