import { useEffect, useMemo, useRef, useState } from 'react'
import { buildWhereQuestions } from '../where'
import type { StepProps } from '../types'

/** Выбрать, где написан стих: книга, затем (в зависимости от сложности) глава и стих */
export default function WhereWritten({ verse, settings, onAnswer }: StepProps) {
  const questions = useMemo(
    () => buildWhereQuestions(verse, settings.levels ?? 1),
    [verse, settings.levels],
  )
  const [qi, setQi] = useState(0)
  const [chosen, setChosen] = useState<{ value: string; ok: boolean }[]>([])
  const answered = useRef(false)

  const done = chosen.length === questions.length
  const correct = chosen.filter((c) => c.ok).length
  const score = Math.round((correct / questions.length) * 100)

  useEffect(() => {
    if (done && !answered.current) {
      answered.current = true
      onAnswer({ score, detail: score < 100 ? verse.ref : undefined })
    }
  }, [done, score, onAnswer, verse.ref])

  function choose(value: string) {
    if (done) return
    const q = questions[qi]
    // Ошибка не заставляет гадать: дальше идём с правильным ответом, а выбор помечается красным
    setChosen((c) => [...c, { value: q.answer, ok: value === q.answer }])
    setQi((i) => i + 1)
  }

  return (
    <div className="exwrap">
      <blockquote className="cue">{verse.text}</blockquote>

      {chosen.map((c, i) => {
        const q = questions[i]
        const label = q.options.find((o) => o.value === q.answer)?.label ?? q.answer
        return (
          <p key={i} className={c.ok ? 'where-line ok' : 'where-line bad'}>
            {c.ok ? '✓' : '✗'} {q.field === 'book' ? 'Книга' : q.field === 'chapter' ? 'Глава' : 'Стих'}: {label}
          </p>
        )
      })}

      {!done && (
        <>
          <h2>{questions[qi].title}</h2>
          <div className="options">
            {questions[qi].options.map((o) => (
              <button key={o.value} className="btn ghost" onClick={() => choose(o.value)}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
