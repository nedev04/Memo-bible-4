import { describe, expect, it } from 'vitest'
import { displayNameOf, validateName } from './profile'

describe('имя пользователя', () => {
  it('приоритет: выбранное имя, имя из Google, часть почты', () => {
    expect(displayNameOf({ display_name: ' Анна ', full_name: 'Anna G' }, 'a@b.c')).toBe('Анна')
    expect(displayNameOf({ full_name: 'Anna G', name: 'x' }, 'a@b.c')).toBe('Anna G')
    expect(displayNameOf({ name: 'Иван' }, 'a@b.c')).toBe('Иван')
    expect(displayNameOf({ display_name: '  ' }, 'ivan.petrov@mail.ru')).toBe('ivan.petrov')
    expect(displayNameOf(undefined, undefined)).toBe('')
  })

  it('проверка имени', () => {
    expect(validateName('  Анна   Мария ')).toEqual({ ok: true, name: 'Анна Мария' })
    expect(validateName('   ').ok).toBe(false)
    expect(validateName('я'.repeat(41)).ok).toBe(false)
    expect(validateName('я'.repeat(40)).ok).toBe(true)
  })
})
