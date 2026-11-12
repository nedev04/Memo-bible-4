import { useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { firstChar, groupLines, judgeTyped, type FlatWord } from '../logic/exercises'

/**
 * Логика поэтапного ввода слов. Используется в «Вводе текста целиком», «Продолжи строку» и «Допиши конец».
 *
 * words — все слова текста, given[i] = true — слово уже показано и вводить его не нужно.
 * Слово засчитывается автоматически (по совпадению, по пробелу или когда набрано нужное число букв).
 * Если слово введено неверно, оно сразу открывается и помечается как ошибка.
 */
export function useWordTyper(words: FlatWord[], given: boolean[]) {
  const letters = useMemo(() => words.map(firstChar), [words])
  const lines = useMemo(() => groupLines(words), [words])
  const isTarget = useCallback((i: number) => !given[i] && letters[i] !== null, [given, letters])

  const skip = useCallback(
    (from: number) => {
      let i = from
      while (i < words.length && !isTarget(i)) i++
      return i
    },
    [words, isTarget],
  )

  const total = useMemo(() => words.filter((_, i) => isTarget(i)).length, [words, isTarget])

  const [pos, setPos] = useState(() => skip(0))
  const [typed, setTyped] = useState('')
  const [bad, setBad] = useState<Set<number>>(() => new Set())
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const done = pos >= words.length
  const doneCount = words.reduce((n, _, i) => n + (i < pos && isTarget(i) ? 1 : 0), 0)
  const score = total === 0 ? 100 : Math.round(((total - bad.size) / total) * 100)

  const focus = () => inputRef.current?.focus({ preventScroll: true })

  function finishWord(ok: boolean) {
    if (!ok) setBad((b) => new Set(b).add(pos))
    setTyped('')
    setPos(skip(pos + 1))
  }

  function onChange(value: string) {
    if (done) return
    const verdict = judgeTyped(value, words[pos].core)
    if (verdict === 'wait') {
      setTyped(value.trim() === '' ? '' : value)
      return
    }
    finishWord(verdict === 'ok')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && typed.trim() !== '' && !done) {
      e.preventDefault()
      finishWord(judgeTyped(typed + ' ', words[pos].core) === 'ok')
    }
  }

  /** Показать слово (считается ошибкой) */
  function reveal() {
    if (done) return
    finishWord(false)
    focus()
  }

  return {
    words, given, lines, pos, typed, bad, done, total, doneCount, score,
    focused, setFocused, inputRef, focus, onChange, onKeyDown, reveal,
  }
}

export type WordTyper = ReturnType<typeof useWordTyper>
