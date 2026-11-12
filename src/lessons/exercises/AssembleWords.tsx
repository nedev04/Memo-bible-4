import { useMemo } from 'react'
import { splitIntoPieces } from '../../logic/exercises'
import type { StepProps } from '../types'
import OrderBoard from './OrderBoard'

/** Собрать стих из слов и фраз в правильном порядке */
export default function AssembleWords({ verse, settings, onAnswer }: StepProps) {
  const pieces = useMemo(() => splitIntoPieces(verse.text, Math.max(2, settings.pieces ?? 6)), [verse.text, settings.pieces])

  if (pieces.length < 2) {
    return (
      <div className="exwrap">
        <p>Стих слишком короткий для этого упражнения.</p>
        <button className="btn primary" onClick={() => onAnswer({ score: 100, neutral: true })}>Дальше</button>
      </div>
    )
  }

  return (
    <OrderBoard
      texts={pieces}
      layout="chips"
      hint="Нажимайте на слова по порядку или перетаскивайте их."
      onDone={(score, correct) => onAnswer({ score, detail: score < 100 ? correct : undefined })}
    />
  )
}
