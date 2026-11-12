import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { clearAll, countLiveVerses } from '../db/db'
import CloudSection from './CloudSection'

export default function DataPage() {
  const verseCount = useLiveQuery(() => countLiveVerses(), [])
  const [message, setMessage] = useState<string | null>(null)

  async function doClear() {
    if (!confirm('Удалить все стихи и весь прогресс? Это нельзя отменить. Если вы вошли в облако, они удалятся и на других устройствах.')) return
    await clearAll()
    setMessage('Все данные удалены.')
  }

  return (
    <>
      <h1>Профиль</h1>

      <CloudSection />

      {message && <p className="notice ok" role="status">{message}</p>}

      <h2>Удаление</h2>
      <p className="muted-block">Стереть все стихи и прогресс. Если вы вошли в облако, удаление распространится и на другие устройства.</p>
      <button className="btn danger" onClick={doClear} disabled={!verseCount}>Удалить все данные</button>
    </>
  )
}
