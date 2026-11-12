import type { ReactNode } from 'react'
import type { FlatWord } from '../logic/exercises'

interface Props {
  words: FlatWord[]
  /** Что нарисовать вместо слова. Возвращайте строку или элемент. */
  renderWord: (w: FlatWord, index: number) => ReactNode
}

/** Выводит слова подряд с учётом переносов строк и разрывов строф */
export default function WordFlow({ words, renderWord }: Props) {
  return (
    <div className="flow">
      {words.map((w, i) => (
        <span key={i}>
          {w.blankBefore && <br />}
          {w.newLine && <br />}
          {renderWord(w, i)}{' '}
        </span>
      ))}
    </div>
  )
}
