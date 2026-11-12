import { useEffect, useMemo, useRef, useState } from 'react'
import { flattenWords } from '../../logic/exercises'
import WordFlow from '../../exercises/WordFlow'
import { applySliderMask, makeRanks } from '../mask'
import type { StepProps } from '../types'

const PEEK_MS = 1600

/** Учебное упражнение: стих показан не полностью. Ползунки меняют, сколько слов и букв скрыто. */
export default function PartialVerse({ verse, settings, onAnswer }: StepProps) {
  const words = useMemo(() => flattenWords(verse.text), [verse.text])
  const ranks = useMemo(() => makeRanks(words), [words])
  const [wordPct, setWordPct] = useState(settings.wordPct ?? 20)
  const [letterPct, setLetterPct] = useState(settings.letterPct ?? 30)
  const [peek, setPeek] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const mask = useMemo(() => applySliderMask(words, ranks, wordPct, letterPct), [words, ranks, wordPct, letterPct])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function peekWord(i: number) {
    window.clearTimeout(timer.current)
    setPeek(i)
    timer.current = window.setTimeout(() => setPeek(null), PEEK_MS)
  }

  return (
    <div className="exwrap">
      <p className="hint">Прочитайте стих вслух. Коснитесь скрытого слова, чтобы увидеть его на секунду.</p>

      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const m = mask[i]
          if (m === null) return w.raw
          const open = peek === i
          return (
            <span>
              {w.lead}
              <button className={open ? 'peek open' : 'peek'} onClick={() => peekWord(i)}>{open ? w.core : m}</button>
              {w.trail}
            </span>
          )
        }}
      />

      <div className="sliders">
        <label>
          <span>Скрытые слова: {wordPct}%</span>
          <input type="range" min={0} max={50} step={5} value={wordPct} onChange={(e) => setWordPct(Number(e.target.value))} />
        </label>
        <label>
          <span>Скрытые буквы: {letterPct}%</span>
          <input type="range" min={0} max={100} step={5} value={letterPct} onChange={(e) => setLetterPct(Number(e.target.value))} />
        </label>
        <small>Первая буква каждого слова остаётся на месте.</small>
      </div>

      <div className="reveal-bar">
        <span className="counter" />
        <button className="btn primary" onClick={() => onAnswer({ score: 100, neutral: true })}>Дальше</button>
      </div>
    </div>
  )
}
