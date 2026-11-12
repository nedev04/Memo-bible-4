import { useEffect, useMemo, useRef } from 'react'
import TypedText from '../../exercises/TypedText'
import { useWordTyper } from '../../exercises/useWordTyper'
import { firstChar, fromLines } from '../../logic/exercises'
import { pickVisibleWords } from '../mask'
import type { StepProps } from '../types'

/**
 * Тестовое задание: ввести стих (или несколько стихов подряд) по памяти с чистого листа.
 * Знаки препинания ставятся сами, ошибочное слово сразу открывается красным.
 */
export default function TypeVerses({ verses, settings, onAnswer }: StepProps) {
  const words = useMemo(() => fromLines(verses.map((v) => v.text.split(/\s+/).filter(Boolean))), [verses])
  const visiblePct = settings.visiblePct ?? 0
  // Часть слов стоит на месте заранее (опора), остальные нужно ввести; при 0 — чистый лист
  const given = useMemo(
    () => (visiblePct > 0 ? pickVisibleWords(words, visiblePct) : words.map(() => false)),
    [words, visiblePct],
  )
  const typer = useWordTyper(words, given)
  const answered = useRef(false)

  useEffect(() => {
    if (!typer.done || answered.current) return
    answered.current = true
    // Результат по каждому стиху отдельно: каждый стих — своя строка
    const perVerse: Record<string, number> = {}
    typer.lines.forEach((ln, li) => {
      let total = 0
      let bad = 0
      for (let i = ln.start; i < ln.end; i++) {
        if (given[i] || firstChar(words[i]) === null) continue
        total++
        if (typer.bad.has(i)) bad++
      }
      if (verses[li]) perVerse[verses[li].key] = total === 0 ? 100 : Math.round(((total - bad) / total) * 100)
    })
    onAnswer({ score: typer.score, perVerse })
  }, [typer.done]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="exwrap">
      <p className="hint">
        {typer.focused || typer.done
          ? visiblePct > 0
            ? 'Часть слов уже стоит на месте. Введите остальные по памяти. Знаки препинания ставятся сами.'
            : verses.length > 1
            ? 'Введите стихи по памяти, каждый с новой строки. Знаки препинания ставятся сами.'
            : 'Введите стих по памяти. Знаки препинания ставятся сами.'
          : 'Коснитесь текста, чтобы открыть клавиатуру.'}
      </p>
      <TypedText typer={typer} maskHidden={visiblePct > 0} />
      {!typer.done && (
        <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
          <span className="counter">{typer.doneCount} / {typer.total}</span>
          <button className="btn ghost" onClick={typer.reveal}>Показать слово</button>
        </div>
      )}
    </div>
  )
}
