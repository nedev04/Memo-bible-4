/** Небольшие заметки о синхронизации в localStorage (если он недоступен — работаем без них) */
const USER_KEY = 'memo:syncUserId'
const cursorKey = (u: string) => `memo:pullCursor:${u}`
const lastKey = (u: string) => `memo:lastSyncAt:${u}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** Аккаунт, с которым это устройство синхронизировалось в последний раз */
export const getSyncUserId = () => read(USER_KEY)
export const setSyncUserId = (id: string | null) => write(USER_KEY, id)

/** До какого момента (по часам сервера) мы уже забрали изменения */
export const getPullCursor = (user: string): number | null => {
  const v = read(cursorKey(user))
  return v ? Number(v) : null
}
export const setPullCursor = (user: string, ms: number | null) => write(cursorKey(user), ms === null ? null : String(ms))

export const getLastSyncAt = (user: string): number | null => {
  const v = read(lastKey(user))
  return v ? Number(v) : null
}
export const setLastSyncAt = (user: string, ms: number) => write(lastKey(user), String(ms))

/** Сбросить курсоры (например, при очистке локальных данных) */
export function resetSyncState(user: string | null) {
  if (user) {
    write(cursorKey(user), null)
    write(lastKey(user), null)
  }
  write(USER_KEY, null)
}
