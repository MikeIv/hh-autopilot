import type { ApplicationStatus, LetterVariant } from './domain'
import type { ScoreResult } from './score'

/** Решение человека по вакансии из очереди ревью. */
export type QueueDecision = 'approve' | 'reject'

/** Сколько откликов в день разрешено — часть контракта, а не настройка. */
export const DAILY_APPLICATION_LIMIT = 20

/** Письмо в очереди: то, что лежит в базе для вакансии. */
export interface QueueLetter {
  variant: LetterVariant
  body: string
  charCount: number
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
