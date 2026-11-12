import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Клиент Supabase. Если настройки не заданы (.env), равен null: приложение работает полностью локально.
 * detectSessionInUrl выключен: вход по паролю не использует ссылки-редиректы, а они конфликтуют с HashRouter.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
    : null

export const cloudConfigured = supabase !== null
