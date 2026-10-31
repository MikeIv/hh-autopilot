import type { ApplicationStatus, LetterVariant } from './domain'
import type { ScoreResult } from './score'

/** Решение человека по вакансии из очереди ревью. */
export type QueueDecision = 'approve' | 'reject'

/** Сколько откликов в день разрешено — часть контракта, а не настройка. */
export const DAILY_APPLICATION_LIMIT = 20

/** Вариант письма в очереди: текст, длина и признак рекомендации. */
export interface QueueLetterVariant {
  variant: LetterVariant
  body: string
  charCount: number
  recommended: boolean
}

/** Письмо в очереди: выбранный вариант, его текст и все три варианта для переключения. */
export interface QueueLetter {
  variant: LetterVariant
  body: string
  charCount: number
  /** Выбрал ли человек вариант вручную: рекомендацию генератора видно по `recommended`. */
  chosen: boolean
  variants: QueueLetterVariant[]
}

/** Вакансия в очереди ревью: оценка с причинами, письмо и статус отклика. */
export interface QueueItem {
  vacancyId: string
  hhId: string
  title: string
  company: string
  url: string
  area: string | null
  salary: string | null
  score: ScoreResult
  letter: QueueLetter | null
  status: ApplicationStatus
  approvedAt: string | null
  sentAt: string | null
  error: string | null
}

/** Ответ очереди: элементы и счётчики дневного лимита. */
export interface QueueResponse {
  threshold: number
  dailyLimit: number
  approvedToday: number
  sentToday: number
  items: QueueItem[]
}

/** Тело запроса решения по вакансии. */
export interface DecisionRequest {
  vacancyId: string
  decision: QueueDecision
}

/** Тело запроса выбора варианта письма. */
export interface LetterChoiceRequest {
  vacancyId: string
  variant: LetterVariant
}
