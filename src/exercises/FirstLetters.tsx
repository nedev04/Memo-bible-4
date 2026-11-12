import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { firstChar, flattenWords, normalize, visibleMask } from '../logic/exercises'
import type { ExerciseProps } from './types'
import WordFlow from './WordFlow'

type Props = ExerciseProps & {
  /** Внутри урока: по окончании сразу сообщает результат, без своей кнопки «Готово» */
  embedded?: boolean
}

export default function FirstLetters({ content, difficulty, onComplete, embedded }: Props) {
  const words = useMemo(() => flattenWords(content), [content])
  const visible = useMemo(() => visibleMask(words, difficulty), [words, difficulty])
  const letters = useMemo(() => words.map(firstChar), [words])
  const total = letters.filter((l) => l !== null).length

  const next = (from: number) => {
    let i = from
    while (i < words.length && letters[i] === null) i++
    return i
  }

  const [pos, setPos] = useState(() => next(0))
  const [mistakes, setMistakes] = useState<Set<number>>(new Set())
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const done = pos >= words.length
  const doneCount = letters.slice(0, pos).filter((l) => l !== null).length

  // preventScroll — чтобы браузер не прыгал к полю ввода при фокусе
  const focusInput = () => inputRef.current?.focus({ preventScroll: true })

  useEffect(() => { focusInput() }, [])

  const curWord = words[pos]
  const firstLetter = curWord?.core?.match(/[\p{L}\p{N}]/u)?.[0]
  const isCapital = Boolean(firstLetter && firstLetter !== firstLetter.toLowerCase())

  // Невидимое поле всегда стоит прямо на текущем слове. Если браузер при вводе всё же захочет
  // «показать поле», он покажет именно текущее слово, а не телепортирует страницу в другое место.
  useLayoutEffect(() => {
    const box = boxRef.current
    const input = inputRef.current
    const cur = box?.querySelector('.cur')
    if (!box || !input) return
    if (cur) {
      input.style.top = `${cur.getBoundingClientRect().top - box.getBoundingClientRect().top}px`
    }
    input.setAttribute('autocapitalize', isCapital ? 'characters' : 'off')
  }, [pos, isCapital])

  // Прокручиваем к текущему слову, только если оно уходит из удобной зоны
  useEffect(() => {
    const el = document.querySelector('.cur')
    if (!el) return
    const vv = window.visualViewport
    const viewH = vv?.height ?? window.innerHeight
    const top = el.getBoundingClientRect().top - (vv?.offsetTop ?? 0)
    if (top < 90 || top > viewH * 0.6) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [pos])

  function onInput(value: string) {
    const ch = [...value].pop()
    if (!ch || done) return
    if (normalize(ch) !== letters[pos]) {
      // Ошибка: слово сразу открывается и помечается красным, идём дальше
      setMistakes((m) => new Set(m).add(pos))
    }
    setPos(next(pos + 1))
  }

  function reveal() {
    if (done) return
    setMistakes((m) => new Set(m).add(pos))
    setPos(next(pos + 1))
    focusInput()
  }

  const score = total === 0 ? 100 : Math.round(((total - mistakes.size) / total) * 100)
  const reported = useRef(false)

  useEffect(() => {
    if (embedded && done && !reported.current) {
      reported.current = true
      onComplete(score)
    }
  }, [embedded, done]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="exwrap" onClick={focusInput}>
      <p className="hint">
        {focused || done
          ? 'Вводите первую букву выделенного слова. Если ошиблись, слово откроется и станет красным.'
          : 'Коснитесь текста, чтобы открыть клавиатуру.'}
      </p>

      <div className="flowbox" ref={boxRef}>
        {/* Невидимое поле: ловит нажатия клавиш */}
        <input
          ref={inputRef}
          className="ghost-input"
          value=""
          autoCapitalize={isCapital ? 'characters' : 'off'}
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Вводите первую букву выделенного слова"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onInput(e.target.value)}
        />
        <WordFlow
          words={words}
          renderWord={(w, i) => {
            const missed = i < pos && mistakes.has(i)
            const shown = i < pos || visible[i]
            const isCur = i === pos && !done
            // Скрытое слово остаётся в вёрстке (прозрачное, с чертой), поэтому пробел точно равен слову
            const cls = [!shown && 'masked', isCur && 'cur', missed && 'missed'].filter(Boolean).join(' ')
            return <span className={cls || undefined} aria-hidden={!shown}>{w.raw}</span>
          }}
        />
      </div>

      {!(embedded && done) && (
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <span className="counter">Точность {score}%</span>
            <button className="btn primary" onClick={() => onComplete(score)}>Готово</button>
          </>
        ) : (
          <>
            <span className="counter">{doneCount} / {total}</span>
            <button className="btn ghost" onClick={reveal}>Показать слово</button>
          </>
        )}
      </div>
      )}
    </div>
  )
}
