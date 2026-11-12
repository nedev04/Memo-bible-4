/** Имя для показа: сначала выбранное пользователем, затем полное имя из данных аккаунта, затем часть почты до «@» */
export function displayNameOf(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const pick = (key: string): string | null => {
    const v = meta?.[key]
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  return pick('display_name') ?? pick('full_name') ?? pick('name') ?? (email ? email.split('@')[0] : '')
}

export const MAX_NAME_LENGTH = 40

export type NameCheck = { ok: true; name: string } | { ok: false; error: string }

/** Имя: от 1 до 40 символов, лишние пробелы убираются */
export function validateName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name === '') return { ok: false, error: 'Введите имя.' }
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, error: `Имя не длиннее ${MAX_NAME_LENGTH} символов.` }
  return { ok: true, name }
}
