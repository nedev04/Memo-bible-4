// Функция Supabase: варианты неверных ответов для упражнения «Пропущенные слова».
// Получает ключ и текст стиха, просит языковую модель подобрать для слов правдоподобные неверные замены,
// сохраняет результат в общую таблицу verse_options (чтобы за каждый стих обращаться к модели один раз) и возвращает его.
//
// Модель: если задан секрет GEMINI_API_KEY, используется Google Gemini (бесплатный уровень, платёжные данные не нужны;
// имя модели можно задать секретом GEMINI_MODEL). Иначе, если задан ANTHROPIC_API_KEY, используется Claude.
// SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// Вызывать функцию могут только вошедшие пользователи (проверка JWT включена по умолчанию).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest'
const DAILY_LIMIT = 300 // сколько новых стихов один пользователь может обработать за сутки
const MAX_TEXT = 1500
const MAX_ITEMS = 14

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Тот же хэш (FNV-1a), что и в приложении: src/lessons/aiParse.ts
function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const coreOf = (token: string) => token.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')

const SYSTEM = `Ты помогаешь учить наизусть стихи Библии (Синодальный перевод) в упражнении «выбери пропущенное слово».
Для стиха выбери слова-кандидаты и для каждого придумай ровно 4 НЕВЕРНЫХ варианта замены.

Требования к неверным вариантам:
- одно слово, той же части речи и в той же грамматической форме (падеж, число, род, лицо, время), что и исходное слово;
- грамматически и стилистически вписываются в предложение, звучат естественно, так что приходится вспоминать текст, а не угадывать по ошибке;
- по смыслу НЕ подходят: это не синонимы и не слова, которые тоже верно продолжили бы мысль, чтобы верный ответ был единственным;
- по возможности библейская лексика; не повторяют слов самого стиха;
- не совпадают с исходным словом.

Выбирай до ${MAX_ITEMS} слов: существительные, глаголы, прилагательные, не короче 4 букв. Не выбирай союзы, предлоги, частицы и местоимения.
Слова в стихе пронумерованы с нуля. Ответь ТОЛЬКО JSON без пояснений и без markdown:
{"items":[{"i":<номер слова>,"word":"<слово без знаков препинания>","options":["...","...","...","..."]}]}`

/** Gemini (бесплатный уровень Google AI Studio). Возвращает текст ответа или null при ошибке. */
async function askGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 4000 },
    }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? []
  return parts.map((p) => p.text ?? '').join('') || null
}

/** Claude (платный ключ). Возвращает текст ответа или null при ошибке. */
async function askClaude(apiKey: string, system: string, user: string): Promise<string | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return data?.content?.[0]?.text ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let key = ''
  let text = ''
  try {
    const body = await req.json()
    key = String(body.key ?? '')
    text = String(body.text ?? '').trim()
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  if (!/^[a-z0-9-]+:[a-z0-9]+:\d+:\d+$/.test(key) || text.length < 5 || text.length > MAX_TEXT) {
    return json({ error: 'bad request' }, 400)
  }
  const hash = textHash(text)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Уже есть — отдаём без обращения к модели
  const { data: existing } = await admin.from('verse_options').select('items').eq('key', key).eq('text_hash', hash).maybeSingle()
  if (existing) return json({ items: existing.items })

  // Защита от злоупотреблений: ограничение по числу новых стихов в сутки на пользователя
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await admin.from('verse_options').select('key', { count: 'exact', head: true }).eq('created_by', userId).gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'limit' }, 429)

  const tokens = text.split(/\s+/).filter(Boolean)
  const numbered = tokens.map((t, i) => `${i}: ${t}`).join('\n')

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!geminiKey && !claudeKey) return json({ error: 'not configured' }, 500)

  const user = `Стих:\n${text}\n\nСлова по номерам:\n${numbered}`
  let raw: string | null = null
  if (geminiKey) raw = await askGemini(geminiKey, SYSTEM, user)
  if (raw === null && claudeKey) raw = await askClaude(claudeKey, SYSTEM, user)
  if (raw === null) return json({ error: 'model' }, 502)

  let parsed: { items?: unknown } = {}
  try {
    parsed = JSON.parse(raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim())
  } catch {
    return json({ error: 'parse' }, 502)
  }

  // Проверка ответа: слово совпадает со словом стиха, варианты — по одному слову, без повторов
  const items: { i: number; word: string; options: string[] }[] = []
  for (const it of Array.isArray(parsed.items) ? parsed.items : []) {
    const { i, word, options } = it as { i?: unknown; word?: unknown; options?: unknown }
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= tokens.length) continue
    if (typeof word !== 'string' || !Array.isArray(options)) continue
    const answer = coreOf(tokens[i])
    if (norm(word) !== norm(answer)) continue
    const seen = new Set([norm(answer)])
    const good: string[] = []
    for (const o of options) {
      if (typeof o !== 'string') continue
      const t = o.trim()
      if (!/^[\p{L}\p{N}-]{2,}$/u.test(t) || seen.has(norm(t))) continue
      seen.add(norm(t))
      good.push(t)
    }
    if (good.length >= 3) items.push({ i, word: answer, options: good.slice(0, 6) })
    if (items.length >= MAX_ITEMS) break
  }
  if (items.length === 0) return json({ error: 'empty' }, 502)

  await admin.from('verse_options').upsert(
    { key, text_hash: hash, items, created_by: userId },
    { onConflict: 'key,text_hash', ignoreDuplicates: true },
  )
  return json({ items })
})
