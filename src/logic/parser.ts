export interface ParsedLine {
  words: string[]
  /** Перед строкой была пустая строка (разрыв строфы) */
  blankBefore: boolean
}

/** Разбивает текст на строки и слова. Пустые строки запоминаются как разрывы. */
export function parseLines(content: string): ParsedLine[] {
  const result: ParsedLine[] = []
  let blank = false
  for (const raw of content.replace(/\r\n?/g, '\n').split('\n')) {
    const words = raw.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      blank = result.length > 0
      continue
    }
    result.push({ words, blankBefore: blank })
    blank = false
  }
  return result
}

export interface Token {
  /** Слово как в тексте, например «"Привет,» */
  raw: string
  /** Знаки в начале */
  lead: string
  /** Само слово (буквы, цифры, дефис, апостроф) */
  core: string
  /** Знаки в конце */
  trail: string
}

/** Отделяет знаки препинания от слова. Пригодится в упражнениях с вводом. */
export function splitToken(raw: string): Token {
  const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
  if (!m || m[2] === '') return { raw, lead: '', core: raw, trail: '' }
  return { raw, lead: m[1], core: m[2], trail: m[3] }
}
