import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { countLiveVerses, wipeLocal } from '../db/db'
import { cloudConfigured, supabase } from './client'
import { syncOnce } from './sync'
import { displayNameOf, validateName } from './profile'
import { getLastSyncAt, getSyncUserId, resetSyncState, setLastSyncAt, setSyncUserId } from './syncMeta'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'
export interface SyncUser {
  id: string
  email: string
  /** Имя для показа */
  name: string
}

interface SyncContext {
  configured: boolean
  /** Проверка сохранённой сессии завершена */
  ready: boolean
  user: SyncUser | null
  status: SyncStatus
  lastSyncAt: number | null
  error: string | null
  syncNow: () => Promise<void>
  /** Возвращают текст ошибки или сообщение для пользователя; null — всё хорошо */
  signIn: (email: string, password: string) => Promise<{ error?: string; info?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; info?: string }>
  /** Сменить имя */
  updateName: (name: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<SyncContext | null>(null)

export function useSync(): SyncContext {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSync вне SyncProvider')
  return v
}

/** Переводит частые ошибки Supabase на русский */
function authMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.'
  if (m.includes('already registered')) return 'Аккаунт с такой почтой уже есть. Войдите.'
  if (m.includes('password should be at least')) return 'Пароль слишком короткий (минимум 6 символов).'
  if (m.includes('email not confirmed')) return 'Почта не подтверждена. Откройте ссылку из письма или отключите подтверждение в настройках Supabase.'
  if (m.includes('rate limit')) return 'Слишком много попыток. Подождите немного.'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Проверьте адрес почты.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Нет связи с сервером.'
  return message
}

const SYNC_INTERVAL_AFTER_CHANGE = 4000
const MIN_GAP_ON_FOCUS = 30_000

export function SyncProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SyncUser | null>(null)
  const [ready, setReady] = useState(!cloudConfigured)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLast] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const userRef = useRef<SyncUser | null>(null)
  const running = useRef(false)
  const queued = useRef(false)
  const lastRun = useRef(0)
  const runRef = useRef<() => Promise<void>>(async () => {})

  const runSync = useCallback(async () => {
    const u = userRef.current
    if (!supabase || !u) return
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    if (running.current) {
      queued.current = true
      return
    }
    running.current = true
    lastRun.current = Date.now()
    setStatus('syncing')
    try {
      await syncOnce(u.id)
      const now = Date.now()
      setLastSyncAt(u.id, now)
      setLast(now)
      setError(null)
      setStatus('idle')
    } catch (e) {
      setError(authMessage(e instanceof Error ? e.message : String(e)))
      setStatus('error')
    } finally {
      running.current = false
      if (queued.current) {
        queued.current = false
        setTimeout(() => void runRef.current(), 0)
      }
    }
  }, [])
  runRef.current = runSync

  // Применяем сессию: проверяем, что на устройстве нет данных другого аккаунта, и запускаем синхронизацию.
  // Вызовы выстраиваются в очередь: getSession и события входа могут прийти одновременно.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const applySession = useCallback((session: Session | null) => {
    queue.current = queue.current.then(() => applyNow(session)).catch(() => {})
    return queue.current
  }, [])

  async function applyNow(session: Session | null) {
    if (!supabase) return
    const u: SyncUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? '',
          name: displayNameOf(session.user.user_metadata, session.user.email),
        }
      : null
    if (u) {
      const prev = getSyncUserId()
      if (prev && prev !== u.id && (await countLiveVerses()) > 0) {
        const ok = confirm(
          'На этом устройстве остались данные другого аккаунта. Удалить их и войти в новый аккаунт? ' +
            'Если отказаться, вход будет отменён.',
        )
        if (!ok) {
          await supabase.auth.signOut()
          return
        }
        await wipeLocal()
        resetSyncState(prev)
      }
      setSyncUserId(u.id)
      setLast(getLastSyncAt(u.id))
    }
    const changed = userRef.current?.id !== u?.id
    userRef.current = u
    setUser(u)
    if (u) {
      if (changed) void runRef.current() // обновление токена не должно запускать синхронизацию
    } else {
      setStatus('idle')
      setError(null)
    }
  }

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session)
      setReady(true)
    })
    // Вызовы Supabase прямо внутри этого колбэка могут зависнуть, поэтому откладываем обработку
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void applySession(session), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [applySession])

  // Автосинхронизация: после локальных изменений, при возвращении в приложение и появлении сети
  useEffect(() => {
    let timer: number | undefined
    const afterChange = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void runRef.current(), SYNC_INTERVAL_AFTER_CHANGE)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > MIN_GAP_ON_FOCUS) {
        void runRef.current()
      }
    }
    const onOnline = () => void runRef.current()
    window.addEventListener('memo:changed', afterChange)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('memo:changed', afterChange)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Облако не настроено.' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { error: authMessage(error.message) } : {}
  }, [])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    if (!supabase) return { error: 'Облако не настроено.' }
    const checked = validateName(name)
    if (!checked.ok) return { error: checked.error }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: checked.name } },
    })
    if (error) return { error: authMessage(error.message) }
    if (!data.session) {
      return { info: 'Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите.' }
    }
    return {}
  }, [])

  const updateName = useCallback(async (name: string) => {
    if (!supabase) return { error: 'Облако не настроено.' }
    const checked = validateName(name)
    if (!checked.ok) return { error: checked.error }
    const { error } = await supabase.auth.updateUser({ data: { display_name: checked.name } })
    return error ? { error: authMessage(error.message) } : {}
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut() // данные на устройстве остаются
  }, [])

  const value = useMemo<SyncContext>(
    () => ({
      configured: cloudConfigured, ready, user, status, lastSyncAt, error,
      syncNow: runSync, signIn, signUp, updateName, signOut,
    }),
    [ready, user, status, lastSyncAt, error, runSync, signIn, signUp, updateName, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

