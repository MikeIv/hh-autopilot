import type { LetterVariant, RunStatus } from './domain'

/** Окно отправки по Москве: 10:00 включительно — 19:00 не включительно, будни. */
export const APPLY_WINDOW_FROM_HOUR = 10
export const APPLY_WINDOW_TO_HOUR = 19

/** Москва — UTC+3 без перехода на летнее время: сдвиг фиксированный. */
export const MSK_OFFSET_HOURS = 3

/** Задержка между откликами: 45–150 секунд, со случайным сдвигом. */
export const APPLY_DELAY_MIN_MS = 45_000
export const APPLY_DELAY_MAX_MS = 150_000

/** Режим прогона: живой или сухой — сухой ничего не нажимает. */
export type ApplyMode = 'live' | 'dry'

/** Почему прогон остановился раньше времени. */
export type ApplyStopReason = 'none' | 'window' | 'limit' | 'panic' | 'blocked' | 'error'

/** Почему отклик не попал в прогон. */
export type ApplySkipReason = 'no_letter'

/** Отклик, готовый к отправке: всё, что нужно браузерному слою. */
export interface ApplyTarget {
  vacancyId: string
  hhId: string
  title: string
  company: string
  url: string
  variant: LetterVariant
  body: string
  charCount: number
}

/** Что вернул браузерный слой: отклик отправлен или уже был отправлен раньше. */
export interface SendResult {
  applied: boolean
  alreadyApplied: boolean
}

/** Пропуск в прогоне: причина и текст для человека. */
export interface ApplySkip {
  vacancyId: string
  title: string
  reason: ApplySkipReason
  message: string
}

/** Итог прогона: режим, счётчики, остановка и план сухого прогона. */
export interface ApplyResult {
  runId: string | null
  mode: ApplyMode
  startedAt: string
  finishedAt: string
  sent: number
  failed: number
  skipped: number
  planned: ApplyTarget[]
  skips: ApplySkip[]
  stopped: ApplyStopReason
  message: string
}

/** Короткая сводка последнего прогона для UI. */
export interface ApplyRunSummary {
  id: string
  status: RunStatus
  startedAt: string
  finishedAt: string | null
  message: string | null
}

/** Состояние отправки для UI: окно, лимит, panic и последний прогон. */
export interface ApplyStatus {
  autoApplyEnabled: boolean
  windowOpen: boolean
  panicAt: string | null
  sentToday: number
  dailyLimit: number
  active: boolean
  lastRun: ApplyRunSummary | null
}

/** Тело запроса прогона: сухой режим и ограничение на этот раз. */
export interface ApplyRequest {
  dryRun?: boolean
  limit?: number
}

/** Ответ на запуск: живой прогон идёт в фоне, сухой возвращает готовый итог. */
export interface ApplyStartResponse {
  started: boolean
  mode: ApplyMode
  dryRun: ApplyResult | null
}

/** Тело запроса ручной отправки одной карточки. */
export interface ManualSendRequest {
  vacancyId: string
}

export interface ManualSendResponse {
  status: 'sent'
  message: string
}
