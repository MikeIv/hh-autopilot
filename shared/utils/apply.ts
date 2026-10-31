import {
  APPLY_DELAY_MAX_MS,
  APPLY_DELAY_MIN_MS,
  APPLY_WINDOW_FROM_HOUR,
  APPLY_WINDOW_TO_HOUR,
  MSK_OFFSET_HOURS,
} from '../types/apply'

const HOUR_MS = 3600_000

/** Момент в московском времени: сдвиг фиксированный, DST в России нет. */
export function mskTime(now: Date): Date {
  return new Date(now.getTime() + MSK_OFFSET_HOURS * HOUR_MS)
}

/** Начало сегодняшнего дня по Москве — граница дневного лимита и счётчиков. */
export function startOfMskDay(now: Date): Date {
  const msk = mskTime(now)
  msk.setUTCHours(0, 0, 0, 0)
  return new Date(msk.getTime() - MSK_OFFSET_HOURS * HOUR_MS)
}

/** Окно отправки: будни, 10:00 включительно — 19:00 не включительно, по Москве. */
export function isApplyWindowOpen(now: Date): boolean {
  const msk = mskTime(now)
  const day = msk.getUTCDay()
  if (day === 0 || day === 6) {
    return false
  }
  const hour = msk.getUTCHours()
  return hour >= APPLY_WINDOW_FROM_HOUR && hour < APPLY_WINDOW_TO_HOUR
}

/** Задержка между откликами 45–150 секунд; rng — от 0 до 1, как Math.random. */
export function nextDelayMs(rng: () => number = Math.random): number {
  const span = APPLY_DELAY_MAX_MS - APPLY_DELAY_MIN_MS
  const normalized = Math.min(1, Math.max(0, rng()))
  return Math.min(APPLY_DELAY_MAX_MS, APPLY_DELAY_MIN_MS + Math.floor(normalized * span))
}

/** «10:42 МСК» для сообщений человеку и записей в лог. */
export function formatMskTime(now: Date): string {
  const msk = mskTime(now)
  const hours = String(msk.getUTCHours()).padStart(2, '0')
  const minutes = String(msk.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes} МСК`
}
