import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { FlatWord } from '../logic/exercises'
import { useKeepInView } from './useKeepInView'
import type { WordTyper } from './useWordTyper'

interface Props {
  typer: WordTyper
  /** Что показать вместо строки, до которой ещё не дошли (например, первую букву). null — ничего. */
  placeholder?: (lineIndex: number, lineWords: FlatWord[]) => ReactNode
  /** Бледная подсказка в текущем слове, пока ничего не набрано */
  slotHint?: (word: FlatWord, index: number) => string | undefined
  /** Показывать «…» в строках, где часть слов ещё скрыта */
  ellipsis?: boolean
  /** Скрытые слова показывать «пробелами» той же ширины (подсказка, где стоят слова) */
  maskHidden?: boolean
}

/**
 * Текст, в котором слова появляются по мере ввода. Введённые слова выводятся вместе со знаками
 * препинания, ошибочные подсвечиваются. Невидимое поле ввода стоит на текущем слове.
 */
export default function TypedText({ typer, placeholder, slotHint, ellipsis, maskHidden }: Props) {
  const { words, given, lines, pos, typed, bad, done, inputRef } = typer
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { typer.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Поле ввода следует за текущим словом, чтобы браузер не прокручивал страницу в другое место
  useLayoutEffect(() => {
    const box = boxRef.current
    const input = inputRef.current
    const cur = box?.querySelector('.cur')
    if (!box || !input || !cur) return
    input.style.top = `${cur.getBoundingClientRect().top - box.getBoundingClientRect().top}px`
  }, [pos, typed, inputRef])

  useKeepInView('.cur', pos)

  return (
    <div className="flowbox typed" ref={boxRef} onClick={typer.focus}>
      <input
        ref={inputRef}
        className="ghost-input"
        value={typed}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Вводите слово, выделенное в тексте"
        onFocus={() => typer.setFocused(true)}
        onBlur={() => typer.setFocused(false)}
        onChange={(e) => typer.onChange(e.target.value)}
        onKeyDown={typer.onKeyDown}
      />
      <div className="flow">
        {lines.map((ln, li) => {
          const parts: ReactNode[] = []
          let hidden = 0
          for (let i = ln.start; i < ln.end; i++) {
            if (i < pos || given[i]) {
              parts.push(
                <span key={i} className={bad.has(i) ? 'missed' : undefined}>{words[i].raw}</span>,
                ' ',
              )
            } else if (i === pos && !done) {
              const hint = slotHint?.(words[i], i)
              parts.push(
                <span key={i} className="cur slot">
                  {typed || (hint ? <span className="slot-hint">{hint}</span> : '\u00a0\u00a0')}
                </span>,
                ' ',
              )
            } else if (maskHidden) {
              parts.push(<span key={i} className="masked" aria-hidden="true">{words[i].raw}</span>, ' ')
            } else {
              hidden++
            }
          }
          if (parts.length === 0) {
            const ph = placeholder?.(li, words.slice(ln.start, ln.end))
            if (ph == null) return null
            return <div key={li} className={ln.blankBefore ? 'tline stanza' : 'tline'}><span className="ph">{ph}</span></div>
          }
          if (hidden > 0 && ellipsis) parts.push(<span key="ell" className="ph">…</span>)
          return <div key={li} className={ln.blankBefore ? 'tline stanza' : 'tline'}>{parts}</div>
        })}
      </div>
    </div>
  )
}
