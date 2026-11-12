import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { compareVerses, formatRange, groupVerses, parseKey } from '../bible/refs'
import { liveVerses } from '../db/db'
import LessonRunner from '../lessons/LessonRunner'
import { loadAiGaps } from '../lessons/aiGaps'
import { loadTexts } from '../lessons/loadTexts'
import { buildPracticeSteps, PRACTICE_OPTIONS, type PracticeOption } from '../lessons/practice'
import { recordStep } from '../lessons/record'
import type { LessonStep, VerseText } from '../lessons/types'

interface Run {
  steps: LessonStep[]
  texts: Map<string, VerseText>
  round: number
}

/**
 * Свободная практика: выбранные стихи и упражнение, которое вы выбираете сами.
 * Результат засчитывается по тем же правилам, что и в уроке: меняется сила стихов и начисляется опыт.
 */
export default function PracticePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const verses = useLiveQuery(() => liveVerses(), [])
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const wanted = useMemo(() => (params.get('keys') ?? '').split(',').filter(Boolean), [params])

  // Только существующие стихи, по порядку Библии
  const keys = useMemo(() => {
    const live = new Set((verses ?? []).map((v) => v.key))
    return wanted
      .filter((k) => live.has(k))
      .map((k) => ({ key: k, ref: parseKey(k) }))
      .filter((x): x is { key: string; ref: NonNullable<ReturnType<typeof parseKey>> } => x.ref !== null)
      .sort((a, b) => compareVerses(a.ref, b.ref))
      .map((x) => x.key)
  }, [wanted, verses])

  if (!verses) return null

  const label = groupVerses(keys.map(parseKey).filter((p): p is NonNullable<typeof p> => p !== null)).map(formatRange).join(', ')

  async function start(option: PracticeOption, levelIndex: number) {
    setError(null)
    setBusy(true)
    try {
      const steps = buildPracticeSteps(option, levelIndex, keys)
      const texts = await loadTexts([...new Set(steps.flatMap((s) => s.verseKeys))])
      if (option.kind === 'fillGaps') await loadAiGaps([...texts.values()])
      const playable = steps.filter((s) => s.verseKeys.every((k) => texts.has(k)))
      if (playable.length === 0) {
        setError('Не удалось загрузить текст стихов. Проверьте соединение и попробуйте ещё раз.')
      } else {
        setRun({ steps: playable, texts, round: round + 1 })
        setRound((r) => r + 1)
      }
    } catch {
      setError('Не удалось загрузить текст стихов. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  if (run) {
    return (
      <LessonRunner
        key={run.round}
        steps={run.steps}
        texts={run.texts}
        record={recordStep}
        retries={false}
        title="Тренировка завершена"
        anotherLabel="К выбору упражнения"
        closeLabel="К стихам"
        onAnother={() => setRun(null)}
        onClose={() => navigate('/verses')}
      />
    )
  }

  if (keys.length === 0) {
    return (
      <>
        <Link to="/verses" className="back">← Мои стихи</Link>
        <h1>Тренировка</h1>
        <p className="empty">Стихи для тренировки не найдены. Выберите их на вкладке «Стихи» кнопкой «Тренировать».</p>
      </>
    )
  }

  return (
    <>
      <Link to="/verses" className="back">← Мои стихи</Link>
      <h1>Тренировка</h1>
      <p><strong>{label}</strong></p>
      <p className="muted-block">
        Выберите упражнение. Результат засчитывается так же, как в уроке: сила стихов меняется по общим правилам и начисляется опыт.
        Учебные упражнения (открытие по тапу, частично скрытый текст) без оценки.
        {keys.length > 6 && ' Стихов в отрывке много, поэтому берутся не больше шести подряд (случайное место).'}
      </p>

      {error && <p className="notice error" role="status">{error}</p>}

      <ul className="list">
        {PRACTICE_OPTIONS.map((option) => (
          <li key={option.kind} className="practice-card">
            <strong>{option.title}</strong>
            <small>{option.description}{option.scored ? '' : ' Без оценки.'}</small>
            <div className="row">
              {option.levels.map((level, i) => (
                <button
                  key={level.label}
                  className={option.levels.length === 1 ? 'btn primary' : 'btn ghost'}
                  disabled={busy}
                  onClick={() => start(option, i)}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
