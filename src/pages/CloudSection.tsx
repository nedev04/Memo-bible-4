import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { MAX_NAME_LENGTH } from '../sync/profile'
import { useSync } from '../sync/SyncProvider'

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })

type Mode = 'in' | 'up'

export default function CloudSection() {
  const sync = useSync()
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  // Сведения для профиля: всего опыта и число пройденных уроков
  const totalXp = useLiveQuery(async () => (await db.reviews.toArray()).reduce((n, r) => n + r.xp, 0), [])
  const lessonCount = useLiveQuery(() => db.lessons.filter((l) => l.verseKeys.length > 0).count(), [])

  if (!sync.configured) {
    return (
      <>
        <h2>Профиль и облако</h2>
        <p className="muted-block">
          Синхронизация между устройствами не подключена: в сборке нет настроек Supabase. Приложение работает без неё,
          данные хранятся на этом устройстве. Как подключить, написано в README.
        </p>
      </>
    )
  }

  if (!sync.ready) {
    return (
      <>
        <h2>Профиль и облако</h2>
        <p className="muted-block">Проверяем вход…</p>
      </>
    )
  }

  async function submit() {
    setMsg(null)
    if (mode === 'up' && name.trim() === '') {
      setMsg({ kind: 'error', text: 'Введите имя: оно будет показываться в профиле.' })
      return
    }
    if (!email.trim() || password.length < 6) {
      setMsg({ kind: 'error', text: 'Введите почту и пароль (минимум 6 символов).' })
      return
    }
    setBusy(true)
    const res = mode === 'in' ? await sync.signIn(email, password) : await sync.signUp(email, password, name)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else if (res.info) setMsg({ kind: 'ok', text: res.info })
    else setPassword('')
  }

  async function saveName() {
    setNameError(null)
    const res = await sync.updateName(draft)
    if (res.error) setNameError(res.error)
    else setEditing(false)
  }

  // ---------- Не вошли ----------
  if (!sync.user) {
    return (
      <>
        <h2>Профиль и облако</h2>
        <p className="muted-block">
          Войдите, чтобы стихи и прогресс синхронизировались между устройствами. Данные с этого устройства загрузятся в аккаунт.
        </p>

        <div className="chips mode-tabs" role="group" aria-label="Способ входа">
          <button className={`chip${mode === 'in' ? ' active' : ''}`} aria-pressed={mode === 'in'} onClick={() => setMode('in')}>Вход</button>
          <button className={`chip${mode === 'up' ? ' active' : ''}`} aria-pressed={mode === 'up'} onClick={() => setMode('up')}>Регистрация</button>
        </div>

        {mode === 'up' && (
          <label className="field">
            Имя
            <input value={name} maxLength={MAX_NAME_LENGTH} autoComplete="given-name" placeholder="Как вас называть" onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="field">
          Почта
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Пароль
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {msg && <p className={msg.kind === 'ok' ? 'notice ok' : 'notice error'} role="status">{msg.text}</p>}
        <button className="btn primary" disabled={busy} onClick={submit}>{mode === 'in' ? 'Войти' : 'Создать аккаунт'}</button>
      </>
    )
  }

  // ---------- Вошли ----------
  const statusText =
    sync.status === 'syncing' ? 'Синхронизация…'
    : sync.status === 'offline' ? 'Нет сети. Синхронизируем, когда появится.'
    : sync.status === 'error' ? 'Ошибка синхронизации'
    : sync.lastSyncAt ? `Синхронизировано: ${fmt(sync.lastSyncAt)}`
    : 'Ещё не синхронизировалось'

  return (
    <>
      <h2>Профиль</h2>
      <section className="profile">
        <div className="avatar" aria-hidden="true">{[...sync.user.name][0]?.toUpperCase() ?? '?'}</div>
        <div className="grow">
          {editing ? (
            <>
              <label className="field compact">
                Имя
                <input value={draft} maxLength={MAX_NAME_LENGTH} autoFocus onChange={(e) => setDraft(e.target.value)} />
              </label>
              {nameError && <p className="notice error" role="status">{nameError}</p>}
              <div className="row">
                <button className="btn primary small" onClick={saveName}>Сохранить</button>
                <button className="btn ghost small" onClick={() => { setEditing(false); setNameError(null) }}>Отмена</button>
              </div>
            </>
          ) : (
            <>
              <strong className="profile-name">{sync.user.name || 'Без имени'}</strong>
              <small>{sync.user.email}</small>
              <button className="btn ghost small" onClick={() => { setDraft(sync.user?.name ?? ''); setNameError(null); setEditing(true) }}>
                Изменить имя
              </button>
            </>
          )}
        </div>
      </section>

      <dl className="facts">
        <div><dt>Опыта</dt><dd>{totalXp ?? 0}</dd></div>
        <div><dt>Уроков пройдено</dt><dd>{lessonCount ?? 0}</dd></div>
      </dl>

      <h2>Облако</h2>
      <p>
        <small>{statusText}</small>
      </p>
      {sync.error && <p className="notice error" role="status">{sync.error}</p>}
      <div className="row">
        <button className="btn primary" disabled={sync.status === 'syncing'} onClick={() => sync.syncNow()}>Синхронизировать сейчас</button>
        <button className="btn ghost" onClick={() => sync.signOut()}>Выйти</button>
      </div>
      <p className="muted-block">
        Изменения отправляются сами. При выходе данные остаются на устройстве. Одна и та же запись, изменённая на двух
        устройствах, берётся из последнего изменения.
      </p>
    </>
  )
}
