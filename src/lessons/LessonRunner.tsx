import { useEffect, useRef, useState, type ComponentType } from 'react'
import ProgressBar from '../components/ProgressBar'
import { PASS_SCORE, PARTIAL_SCORE } from '../logic/config'
import AssembleWords from './exercises/AssembleWords'
import FillGapsVerse from './exercises/FillGapsVerse'
import FirstLettersVerse from './exercises/FirstLettersVerse'
import OrderParts from './exercises/OrderParts'
import PartialVerse from './exercises/PartialVerse'
import RevealVerse from './exercises/RevealVerse'
import TypeVerses from './exercises/TypeVerses'
import WhereWritten from './exercises/WhereWritten'
import { KIND_SHOWS_REF, KIND_TITLE, type ExerciseKind, type LessonStep, type StepOutcome, type StepProps, type StepResult, type VerseText } from './types'

const COMPONENTS: Record<ExerciseKind, ComponentType<StepProps>> = {
  reveal: RevealVerse,
  partial: PartialVerse,
  fillGaps: FillGapsVerse,
  assemble: AssembleWords,
  whereWritten: WhereWritten,
  orderParts: OrderParts,
  typing: TypeVerses,
  firstLetters: FirstLettersVerse,
}

/** Форматирует ссылку на стих, гарантируя отсутствие дубликатов */
function stepRef(verses: VerseText[]): string {
  if (!verses || verses.length === 0) return ''
  const uniqueVerses: VerseText[] = []
  const seen = new Set<string>()
  for (const v of verses) {
    if (!v) continue
    const k = v.key || v.ref
    if (!seen.has(k)) {
      seen.add(k)
      uniqueVerses.push(v)
    }
  }
  if (uniqueVerses.length === 0) return ''

  const first = uniqueVerses[0]
  const last = uniqueVerses[uniqueVerses.length - 1]
  let result = ''

  if (uniqueVerses.length === 1 || first.book !== last.book || first.chapter !== last.chapter || first.verse === last.verse) {
    result = first.ref
  } else {
    const name = first.ref.slice(0, first.ref.lastIndexOf(' '))
    result = `${name} ${first.chapter}:${first.verse}–${last.verse}`
  }

  // Защита от дублирования фразы ссылки вида «Псалтирь 115:6 Псалтирь 115:6»
  const trimmed = result.trim()
  const words = trimmed.split(/\s+/)
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2
    const firstHalf = words.slice(0, half).join(' ')
    const secondHalf = words.slice(half).join(' ')
    if (firstHalf === secondHalf) return firstHalf
  }

  return trimmed
}

export interface LessonSummary {
  xp: number
  mistakes: number
  /** Стихи урока */
  keys: string[]
}

interface Props {
  steps: LessonStep[]
  texts: Map<string, VerseText>
  /** Сохраняет результат (сила стиха, журнал) и возвращает полученный опыт */
  record: (step: LessonStep, result: StepResult) => Promise<StepOutcome>
  /** Закрыть урок (вернуться к стихам) */
  onClose: () => void
  /** Начать следующий урок */
  onAnother: () => void
  /** Урок завершён (вызывается один раз) */
  onFinish?: (summary: LessonSummary) => void
  /** Повторять ли в конце упражнения с ошибками (в свободной практике нет) */
  retries?: boolean
  /** Подписи итогового экрана */
  title?: string
  anotherLabel?: string
  closeLabel?: string
}

export default function LessonRunner({
  steps, texts, record, onClose, onAnother, onFinish,
  retries = true, title = 'Урок пройден', anotherLabel = 'Ещё урок', closeLabel = 'К стихам',
}: Props) {
  const [queue, setQueue] = useState<LessonStep[]>(steps)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<StepResult | null>(null)
  const [xp, setXp] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [changes, setChanges] = useState<Map<string, 'up' | 'down'>>(new Map())
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const step = queue[index]
  const finishedOnce = useRef(false)

  useEffect(() => {
    if (!done || finishedOnce.current) return
    finishedOnce.current = true
    onFinish?.({ xp, mistakes, keys: [...new Set(steps.flatMap((s) => s.verseKeys))] })
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onAnswer(r: StepResult) {
    if (result || busy || done) return
    setBusy(true)
    try {
      const outcome = await record(step, r)
      setXp((x) => x + outcome.xp)
      setChanges((prev) => {
        const next = new Map(prev)
        for (const c of outcome.changes) if (c.change !== 'same') next.set(c.key, c.change)
        return next
      })
    } finally {
      setBusy(false)
    }
    if (r.neutral) {
      advance(queue.length)
      return
    }
    setResult(r)
    // Ошибка: то же упражнение будет ещё раз в конце урока (один раз). Ввод по памяти не повторяется: он длинный.
    if (retries && r.score < PASS_SCORE && !step.retry && step.kind !== 'typing') {
      setMistakes((m) => m + 1)
      setQueue((q) => [...q, { ...step, id: `${step.id}:retry`, retry: true }])
    }
  }

  function advance(length = queue.length) {
    setResult(null)
    if (index + 1 >= length) setDone(true)
    else setIndex(index + 1)
  }

  function close() {
    if (done || confirm('Выйти из урока? Результаты уже пройденных упражнений сохранены.')) onClose()
  }

  if (done) {
    const list = [...changes.entries()]
    return (
      <div className="result lesson-done">
        <h1>{title}</h1>
        <p className="xp">+{xp} опыта</p>
        <p className="muted-block">{mistakes === 0 ? 'Без ошибок.' : `Ошибок: ${mistakes}.`}</p>
        {list.length > 0 && (
          <ul className="changes">
            {list.map(([key, change]) => (
              <li key={key} className={change}>
                {change === 'up' ? '▲' : '▼'} {texts.get(key)?.ref ?? key}: {change === 'up' ? 'запомнился лучше' : 'нужно повторить'}
              </li>
            ))}
          </ul>
        )}
        <div className="result-actions">
          <button className="btn primary" onClick={onAnother}>{anotherLabel}</button>
          <button className="btn ghost" onClick={onClose}>{closeLabel}</button>
        </div>
      </div>
    )
  }

  const verses = step.verseKeys.map((k) => texts.get(k)!)
  const verse = verses[0]
  const Exercise = COMPONENTS[step.kind]
  const total = queue.length
  const finished = index + (result ? 1 : 0)

  return (
    <div className={result ? 'lesson has-feedback' : 'lesson'}>
      <div className="lesson-top">
        <button className="lesson-close" onClick={close} aria-label="Выйти из урока">✕</button>
        <ProgressBar value={finished} max={total} />
      </div>

      <h1 className="lesson-title">
        <span className="lesson-title-text">{KIND_TITLE[step.kind]}</span>
        {(KIND_SHOWS_REF[step.kind] || step.retry) && (
          <span className="lesson-ref-badge">
            {[KIND_SHOWS_REF[step.kind] ? stepRef(verses) : '', step.retry ? 'повтор' : ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </h1>

      <Exercise key={step.id} verse={verse} verses={verses} settings={step.settings} onAnswer={onAnswer} />

      {result && (
        <div className={`feedback ${result.score >= PASS_SCORE ? 'ok' : result.score >= PARTIAL_SCORE ? 'mid' : 'bad'}`} role="status">
          <strong>
            {result.score >= PASS_SCORE ? 'Верно!' : result.score >= PARTIAL_SCORE ? 'Почти верно' : 'Есть ошибки'}
          </strong>
          {result.detail && <span>{result.detail}</span>}
          {retries && result.score < PASS_SCORE && !step.retry && step.kind !== 'typing' && <small>Это упражнение повторится в конце урока.</small>}
          <button className="btn primary" autoFocus onClick={() => advance()}>Продолжить</button>
        </div>
      )}
    </div>
  )
}
