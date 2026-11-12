import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { sameOrderText, scoreOrder, shuffleBlocks } from '../../logic/exercises'

interface Props {
  /** Части в правильном порядке */
  texts: string[]
  /** chips — короткие слова и фразы в строку; blocks — крупные части списком */
  layout: 'chips' | 'blocks'
  /** Подписи, которые показываются после проверки (например, номера стихов) */
  labels?: string[]
  hint: string
  /** Вызывается после проверки: точность и правильный порядок для пояснения */
  onDone: (score: number, correctText: string) => void
}

/**
 * Общая доска для упражнений «собери по порядку».
 * Части можно перетаскивать (мышью или пальцем) и просто нажимать: нажатие переносит часть
 * из набора в ответ, а нажатие на часть в ответе возвращает её обратно.
 */
export default function OrderBoard({ texts, layout, labels, hint, onDone }: Props) {
  const pile = useMemo(() => shuffleBlocks(texts), [texts]) // порядок частей в наборе
  const [placed, setPlaced] = useState<number[]>([])
  const [checked, setChecked] = useState(false)
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const placedRef = useRef(placed)
  placedRef.current = placed

  const rest = pile.filter((id) => !placed.includes(id))
  const allPlaced = placed.length === texts.length
  const score = scoreOrder(placed.map((id) => texts[id]), texts)
  // Если итоговый текст верный, все части считаются верными, даже если стоят иначе, чем в исходной разбивке
  const textIsRight = allPlaced && sameOrderText(placed.map((id) => texts[id]), texts)

  function tap(id: number) {
    if (checked) return
    setPlaced((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  /** Вставляет часть в ответ на позицию index (позиции считаются до удаления самой части) */
  function insertAt(id: number, index: number) {
    setPlaced((p) => {
      const from = p.indexOf(id)
      const without = p.filter((x) => x !== id)
      const at = from !== -1 && from < index ? index - 1 : index
      without.splice(Math.max(0, Math.min(at, without.length)), 0, id)
      return without
    })
  }

  function drop(id: number, x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const slot = el?.closest<HTMLElement>('[data-slot]')
    if (slot) {
      const index = Number(slot.dataset.slot)
      const r = slot.getBoundingClientRect()
      const after = layout === 'chips' ? x > r.left + r.width / 2 : y > r.top + r.height / 2
      insertAt(id, after ? index + 1 : index)
    } else if (el?.closest('[data-zone="answer"]')) {
      insertAt(id, placedRef.current.length)
    } else if (el?.closest('[data-zone="pile"]')) {
      setPlaced((p) => p.filter((x) => x !== id))
    }
  }

  function startDrag(e: ReactPointerEvent, id: number) {
    if (checked || (e.pointerType === 'mouse' && e.button !== 0)) return
    const sx = e.clientX
    const sy = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) moved = true
      if (moved) setDrag({ id, x: ev.clientX, y: ev.clientY })
    }
    const end = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setDrag(null)
      if (!moved) return // обычное нажатие обработает onClick
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 60)
      if (!cancelled) drop(id, ev.clientX, ev.clientY)
    }
    const up = (ev: PointerEvent) => end(ev, false)
    const cancel = (ev: PointerEvent) => end(ev, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  function onClickPiece(id: number) {
    if (suppressClick.current) return
    tap(id)
  }

  function check() {
    setChecked(true)
    onDone(score, texts.join(layout === 'chips' ? ' ' : '\n'))
  }

  const [lines, setLines] = useState<number[][]>([])
  const pileRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (!pileRef.current || layout !== 'chips') return
    const items = Array.from(pileRef.current.children) as HTMLElement[]
    if (items.length === 0) return

    const grouped: { top: number; ids: number[] }[] = []
    items.forEach((el) => {
      const id = Number(el.dataset.id)
      if (isNaN(id)) return
      const top = el.offsetTop
      const existing = grouped.find((g) => Math.abs(g.top - top) < 8)
      if (existing) {
        existing.ids.push(id)
      } else {
        grouped.push({ top, ids: [id] })
      }
    })
    grouped.sort((a, b) => a.top - b.top)
    setLines(grouped.map((g) => g.ids))
  }, [pile, layout])

  const piece = (id: number, slot?: number, state?: 'ok' | 'bad', isHiddenPlaceholder?: boolean) => {
    if (isHiddenPlaceholder) {
      return (
        <li
          key={id}
          data-id={id}
          className={`piece ${layout}`}
          style={{ visibility: 'hidden', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <button className="piece-btn" disabled tabIndex={-1}>
            {texts[id]}
          </button>
        </li>
      )
    }

    return (
      <li
        key={id}
        data-id={id}
        className={`piece ${layout}${drag?.id === id ? ' dragging' : ''}${state ? ` ${state}` : ''}`}
        data-slot={slot}
      >
        {layout === 'blocks' && !checked && (
          <span className="grip" onPointerDown={(e) => startDrag(e, id)} aria-hidden="true">
            ⋮⋮
          </span>
        )}
        <button
          className="piece-btn"
          onClick={() => onClickPiece(id)}
          onPointerDown={layout === 'chips' ? (e) => startDrag(e, id) : undefined}
          disabled={checked}
        >
          {checked && labels?.[id] && <sup className="plabel">{labels[id]}</sup>}
          {texts[id]}
        </button>
      </li>
    )
  }

  return (
    <div className="exwrap board">
      <p className="hint">{hint}</p>

      <ol className={`zone answer ${layout}`} data-zone="answer" aria-label="Ваш порядок">
        {placed.length === 0 && <li className="zone-empty">Нажимайте на части или перетаскивайте их сюда</li>}
        {placed.map((id, i) => piece(id, i, checked ? (textIsRight || texts[id] === texts[i] ? 'ok' : 'bad') : undefined))}
      </ol>

      {!checked && rest.length > 0 && (
        <ul ref={pileRef} className={`zone pile ${layout}`} data-zone="pile" aria-label="Части">
          {layout === 'chips' && lines.length > 0 ? (
            lines.map((line) => {
              const isLineEmpty = line.every((id) => placed.includes(id))
              if (isLineEmpty) return null
              return line.map((id) => {
                const isPlaced = placed.includes(id)
                return piece(id, undefined, undefined, isPlaced)
              })
            })
          ) : (
            (layout === 'chips' ? pile : rest).map((id) => {
              const isPlaced = placed.includes(id)
              return piece(id, undefined, undefined, layout === 'chips' ? isPlaced : undefined)
            })
          )}
        </ul>
      )}

      {checked && score < 100 && (
        <>
          <h2>Правильный порядок</h2>
          <p className="correct-text">{texts.join(layout === 'chips' ? ' ' : ' ')}</p>
        </>
      )}

      {drag && (
        <div className={`drag-ghost ${layout}`} style={{ left: drag.x, top: drag.y }}>{texts[drag.id]}</div>
      )}

      {!checked && (
        <div className="reveal-bar">
          <span className="counter">{placed.length} / {texts.length}</span>
          <button className="btn primary" disabled={!allPlaced} onClick={check}>Проверить</button>
        </div>
      )}
    </div>
  )
}
