import { matchCase, normalize, type FlatWord } from '../logic/exercises'

/**
 * Короткий хэш текста стиха (FNV-1a). Нужен, чтобы сохранённые варианты ответов не устаревали, если текст стиха изменится
 * (например, после исправления нумерации). Тот же алгоритм используется в функции Supabase.
 */
export function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Проверяет и приводит в порядок варианты ответов от ИИ.
 * raw — список {i, word, options}: номер слова в стихе (с нуля), само слово и неверные варианты.
 * Остаются только записи, где слово совпадает со словом в стихе, а варианты — по одному слову, без повторов и без правильного ответа.
 * Результат: номер слова → варианты с тем же регистром первой буквы, что и у правильного слова.
 */
export function parseAiItems(raw: unknown, words: FlatWord[]): Record<number, string[]> {
  const out: Record<number, string[]> = {}
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { i, word, options } = item as { i?: unknown; word?: unknown; options?: unknown }
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= words.length) continue
    if (typeof word !== 'string' || !Array.isArray(options)) continue
    const answer = words[i].core
    if (normalize(word) !== normalize(answer)) continue

    const seen = new Set([normalize(answer)])
    const good: string[] = []
    for (const o of options) {
      if (typeof o !== 'string') continue
      const t = o.trim()
      if (!/^[\p{L}\p{N}-]{2,}$/u.test(t)) continue // одно слово
      const n = normalize(t)
      if (seen.has(n)) continue
      seen.add(n)
      good.push(matchCase(t, answer))
    }
    if (good.length >= 3) out[i] = good.slice(0, 6)
  }
  return out
}
