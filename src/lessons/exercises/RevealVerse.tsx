import { useMemo, useState } from 'react'
import type { StepProps } from '../types'

/** Учебное упражнение: стих открывается по частям при касании экрана */
export default function RevealVerse({ verse, settings, onAnswer }: StepProps) {
  const size = Math.max(1, settings.chunk ?? 2)
  const chunks = useMemo(() => {
    const words = verse.text.split(/\s+/).filter(Boolean)
    const out: string[] = []
    for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' '))
    return out
  }, [verse.text, size])
  const [shown, setShown] = useState(0)
  const done = shown >= chunks.length

  return (
    <div className="reveal" onClick={() => !done && setShown((s) => s + 1)}>
      <div className="reveal-text">
        {shown === 0 && <p className="hint">Касайтесь экрана, чтобы стих открывался по частям.</p>}
        {chunks.slice(0, shown).map((c, i) => (
          <span key={i} className={i === shown - 1 && !done ? 'fresh' : undefined}>{c}{' '}</span>
        ))}
      </div>
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost" disabled={shown === 0} onClick={() => setShown((s) => Math.max(0, s - 1))}>Назад</button>
        <span className="counter">{shown} / {chunks.length}</span>
        {done ? (
          <button className="btn primary" onClick={() => onAnswer({ score: 100, neutral: true })}>Дальше</button>
        ) : (
          <button className="btn ghost" onClick={() => setShown(chunks.length)}>Весь стих</button>
        )}
      </div>
    </div>
  )
}
