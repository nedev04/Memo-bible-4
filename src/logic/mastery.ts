import type { VerseState } from '../types'
import { BAD_SCORE, DAY, PARTIAL_SCORE, PASS_SCORE } from './config'

/**
 * У стиха две независимые характеристики.
 *
 * Сила (0–7) показывает, насколько хорошо стих знают сейчас:
 * 0 — только добавлен, 1–2 — начал учить, 3–4 — средне, 5–6 — твёрдо, 7 — выучено.
 * Сила 1–6 растёт за успешные упражнения, сколько угодно раз в день (упражнение должно быть достаточно сложным
 * для текущей силы), и падает при ошибках. Седьмой уровень даётся отдельным правилом (см. ниже).
 *
 * Стадия повторения (0–6) — число пройденных циклов повторения. Она задаёт расписание: циклы приходятся на дни
 * 0, 1, 3, 7, 14, 30, 60 от начала изучения. Стадия растёт только когда цикл успешно пройден в назначенный день.
 */
export const MAX_STRENGTH = 7
/** Выше этой силы стих поднимается не упражнениями, а правилом четвёртого цикла */
export const PERFORMANCE_MAX = 6
export const MAX_STAGE = 6
/** На каком цикле повторения стих с силой 6 становится «выученным» (7-й день при регулярных занятиях) */
export const LEARNED_CYCLE = 4

/**
 * Через сколько дней назначается следующий цикл после перехода на стадию (индекс = новая стадия).
 * При занятиях без пропусков циклы приходятся на дни 0, 1, 3, 7, 14, 30, 60. Следующий срок считается от дня,
 * когда цикл действительно пройден, поэтому пропуск сдвигает все последующие циклы на столько же дней.
 */
export const CYCLE_GAP_DAYS = [0, 1, 2, 4, 7, 16, 30]
/** Когда стадия уже последняя, стих повторяется раз в столько дней */
export const MAINTENANCE_GAP_DAYS = 60

/**
 * Сложность упражнения для запоминания:
 * 1 — узнавание (выбрать слово, расставить части, открыть по тапу),
 * 2 — вспоминание с опорой (первые буквы, частично скрытый текст),
 * 3 — вспоминание без подсказок (ввести текст по памяти).
 */
export type Tier = 1 | 2 | 3

/** Упражнение какой сложности нужно пройти, чтобы сила (или стадия) выросла с N на N+1 */
export const REQUIRED_TIER: Tier[] = [1, 1, 2, 2, 3, 3, 3]

/** Очки опыта за упражнение при результате 100% (по сложности) */
const XP_BASE: Record<Tier, number> = { 1: 5, 2: 10, 3: 15 }

export const xpFor = (tier: Tier, score: number): number => Math.round((XP_BASE[tier] * Math.max(0, Math.min(100, score))) / 100)

export const isDue = (v: Pick<VerseState, 'nextReviewAt'>, now: number): boolean => now >= v.nextReviewAt

/**
 * Начало календарного дня через `days` дней (по местному времени). Сроки повторений считаются по календарным дням:
 * стих, изученный вечером, «завтра» доступен с самого утра, а не через 24 часа.
 */
export function dayStartPlus(now: number, days: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export type StrengthGroup = 'new' | 'started' | 'medium' | 'strong' | 'learned'

export function strengthGroup(strength: number): StrengthGroup {
  if (strength >= 7) return 'learned'
  if (strength >= 5) return 'strong'
  if (strength >= 3) return 'medium'
  if (strength >= 1) return 'started'
  return 'new'
}

export const STRENGTH_LABEL: Record<StrengthGroup, string> = {
  new: 'Новый',
  started: 'Начал учить',
  medium: 'Средне',
  strong: 'Твёрдо',
  learned: 'Выучено',
}

export interface VerseUpdate {
  verse: VerseState
  change: 'up' | 'down' | 'same'
}

/** Через сколько дней следующий цикл после перехода на эту стадию */
const gapAfter = (stage: number): number => CYCLE_GAP_DAYS[Math.min(stage, MAX_STAGE)]

/**
 * Применяет результат одного упражнения по стиху.
 *
 * Сила:
 * - результат 90% и выше поднимает силу на 1 (до 6), если упражнение не проще нужного (REQUIRED_TIER).
 *   Ограничения «раз в день» нет;
 * - результат ниже 70% снижает силу на 1 (ниже 40% — на 2), но не ниже 1;
 * - результат 70–89% силу не меняет;
 * - седьмой уровень («выучено»): когда стих с силой 6 успешно проходит четвёртый цикл повторения (или любой следующий).
 *
 * Расписание (циклы):
 * - первый зачёт нового стиха завершает первый цикл (стадия 1): второй цикл назначается на завтра;
 * - зачёт в назначенный день (достаточно сложным упражнением) завершает цикл: стадия растёт, следующий цикл
 *   назначается через положенное число дней от сегодняшнего дня. Если цикл пройден позже срока, все следующие сдвигаются.
 *   До зачёта стих остаётся «к повторению»;
 * - ошибка в срок снижает стадию (на 1, ниже 40% — на 2, не ниже 1) и возвращает стих на завтра;
 * - ошибка до срока стадию не меняет, но стих вернётся в очередь не позже чем завтра;
 * - результат 70–89% в срок: повтор раньше, примерно через половину обычного интервала.
 */
export function applyVerseResult(verse: VerseState, result: { tier: Tier; score: number }, now: number): VerseUpdate {
  const { tier, score } = result
  const s = verse.strength
  const st = verse.stage
  const due = isDue(verse, now)
  const v: VerseState = { ...verse, lastPracticedAt: now, lastScore: score }
  let change: VerseUpdate['change'] = 'same'

  if (score < PARTIAL_SCORE) {
    const drop = score < BAD_SCORE ? 2 : 1
    if (s >= 1) {
      v.strength = Math.max(1, s - drop)
      if (v.strength < s) change = 'down'
    }
    if (st >= 1 && due) {
      v.stage = Math.max(1, st - drop)
      v.lapses = verse.lapses + 1
      v.nextReviewAt = dayStartPlus(now, 1)
    } else if (st >= 1) {
      v.nextReviewAt = Math.min(verse.nextReviewAt, dayStartPlus(now, 1))
    } else {
      v.nextReviewAt = now // новый стих пока не получился — остаётся «к изучению»
    }
  } else if (score < PASS_SCORE) {
    if (st === 0) v.nextReviewAt = now
    else if (due) v.nextReviewAt = dayStartPlus(now, Math.max(1, Math.round(gapAfter(st) / 2)))
  } else {
    if (s < PERFORMANCE_MAX && tier >= REQUIRED_TIER[s]) {
      v.strength = s + 1
      v.lastUpAt = now
      change = 'up'
    }
    if (st === 0) {
      if (v.strength >= 1) {
        v.stage = 1
        v.nextReviewAt = dayStartPlus(now, gapAfter(1))
      } else {
        v.nextReviewAt = now
      }
    } else if (due && tier >= REQUIRED_TIER[st]) {
      const finalStage = st >= MAX_STAGE
      v.stage = Math.min(MAX_STAGE, st + 1)
      v.nextReviewAt = dayStartPlus(now, finalStage ? MAINTENANCE_GAP_DAYS : gapAfter(v.stage))
      // Четвёртый цикл пройден, а сила уже 6: стих выучен
      if (v.stage >= LEARNED_CYCLE && v.strength === PERFORMANCE_MAX) {
        v.strength = MAX_STRENGTH
        v.lastUpAt = now
        change = 'up'
      }
    }
  }
  return { verse: v, change }
}

/** Стих нужно уделить внимание: недавно допущена ошибка или он ещё не получился */
export const needsAttention = (v: VerseState): boolean => v.lastScore !== null && v.lastScore < PARTIAL_SCORE

/** Подпись срока повторения: «Пора повторить», «Повтор завтра», «Повтор через 3 дн.» */
export function dueLabel(nextReviewAt: number, now: number): string {
  if (now >= nextReviewAt) return 'Пора повторить'
  const days = Math.ceil((nextReviewAt - now) / DAY)
  return days <= 1 ? 'Повтор завтра' : `Повтор через ${days} дн.`
}
