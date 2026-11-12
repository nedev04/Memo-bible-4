import { useMemo } from 'react'
import { splitIntoPieces } from '../../logic/exercises'
import type { StepProps } from '../types'
import OrderBoard from './OrderBoard'

/**
 * Расставить крупные части по порядку: несколько стихов подряд (каждый стих — часть)
 * либо один большой стих, разбитый на части. Номера стихов видны только после проверки.
 */
export default function OrderParts({ verses, onAnswer }: StepProps) {
  const { texts, labels } = useMemo(() => {
    if (verses.length >= 2) return { texts: verses.map((v) => v.text), labels: verses.map((v) => String(v.verse)) }
    return { texts: splitIntoPieces(verses[0].text, 4), labels: undefined }
  }, [verses])

  if (texts.length < 2) {
    return (
      <div className="exwrap">
        <p>Текст слишком короткий для этого упражнения.</p>
        <button className="btn primary" onClick={() => onAnswer({ score: 100, neutral: true })}>Дальше</button>
      </div>
    )
  }

  return (
    <OrderBoard
      texts={texts}
      labels={labels}
      layout="blocks"
      hint="Расставьте части в том порядке, в котором они идут в Писании. Нажимайте на них или перетаскивайте за ручку слева."
      onDone={(score) => onAnswer({ score })}
    />
  )
}
