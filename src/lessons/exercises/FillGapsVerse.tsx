import { useEffect, useMemo, useRef, useState } from 'react'
import { flattenWords } from '../../logic/exercises'
import WordFlow from '../../exercises/WordFlow'
import { buildVerseGaps } from '../gaps'
import type { StepProps } from '../types'

/** Проверка: выбрать пропущенные слова. Ошибка сразу открывает правильное слово, красным. */
export default function FillGapsVerse({ verse, settings, onAnswer }: StepProps) {
  const words = useMemo(() => flattenWords(verse.text), [verse.text])
  const pool = useMemo(() => flattenWords(verse.chapterText), [verse.chapterText])
  // Пропусков может быть много: до трети слов стиха (рядом они не стоят)
  const blanks = Math.max(1, Math.min(settings.blanks ?? 1, Math.floor(words.length / 3)))
  const ai = useMemo(
    () => (verse.aiGaps ? new Map(Object.entries(verse.aiGaps).map(([i, o]) => [Number(i), o] as [number, string[]])) : undefined),
    [verse.aiGaps],
  )
  const gaps = useMemo(
    () => buildVerseGaps(words, pool, blanks, settings.options ?? 3, Math.random, ai),
    [words, pool, blanks, settings.options, ai],
  )
  const gapByWord = useMemo(() => new Map(gaps.map((g, i) => [g.wordIndex, i])), [gaps])

  const [solved, setSolved] = useState<boolean[]>(() => gaps.map(() => false))
  const [wrong, setWrong] = useState<boolean[]>(() => gaps.map(() => false))
  const [cur, setCur] = useState(0)
  const answered = useRef(false)

  const done = gaps.length > 0 && solved.every(Boolean)
  const mistakes = wrong.filter(Boolean).length
  const score = gaps.length === 0 ? 100 : Math.round(((gaps.length - mistakes) / gaps.length) * 100)

  useEffect(() => {
    if (answered.current) return
    if (gaps.length === 0) {
      answered.current = true
      onAnswer({ score: 100, neutral: true }) // стих слишком короткий для этого упражнения
    } else if (done) {
      answered.current = true
      onAnswer({ score })
    }
  }, [done, gaps.length, score, onAnswer])

  function choose(option: string) {
    if (done) return
    const gap = gaps[cur]
    if (option !== gap.answer) setWrong((w) => w.map((x, i) => (i === cur ? true : x)))
    const nextSolved = solved.map((s, i) => (i === cur ? true : s))
    setSolved(nextSolved)
    for (let k = 1; k <= gaps.length; k++) {
      const j = (cur + k) % gaps.length
      if (!nextSolved[j]) {
        setCur(j)
        break
      }
    }
  }

  return (
    <div className="exwrap">
      <p className="hint">Нажмите на пропуск и выберите слово. Если ошибётесь, верное слово встанет на место красным.</p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const g = gapByWord.get(i)
          if (g === undefined) return w.raw
          if (solved[g]) {
            return <span>{w.lead}<span className={wrong[g] ? 'filled bad' : 'filled'}>{w.core}</span>{w.trail}</span>
          }
          return (
            <span>
              {w.lead}
              <button className={g === cur ? 'gap cur' : 'gap'} onClick={() => setCur(g)} aria-label="Пропуск">{w.core}</button>
              {w.trail}
            </span>
          )
        }}
      />

      {!done && gaps.length > 0 && (
        <div className="reveal-bar col">
          <div className="options">
            {gaps[cur].options.map((o) => (
              <button key={o} className="btn ghost" onClick={() => choose(o)}>{o}</button>
            ))}
          </div>
          <span className="counter">{solved.filter(Boolean).length} / {gaps.length}</span>
        </div>
      )}
    </div>
  )
}
