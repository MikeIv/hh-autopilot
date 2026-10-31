/** Статусы и виды записей. SQLite не поддерживает enum, поэтому union-типы живут здесь. */

/** Отклик: от очереди ревью до результата отправки. */
export type ApplicationStatus =
  'queued' | 'approved' | 'rejected' | 'sending' | 'sent' | 'failed' | 'needs_human'

/** Что именно сделал прогон. */
export type RunKind = 'collect' | 'score' | 'letter' | 'apply'

export type RunStatus = 'running' | 'done' | 'failed' | 'needs_human'

export type LogLevel = 'info' | 'warn' | 'error'

export type LogKind = 'collect' | 'score' | 'letter' | 'apply' | 'guard' | 'system'

/** Вариант письма: под продуктовую вакансию, аутстафф или сервисную разработку. */
export type LetterVariant = 'product' | 'outstaff' | 'service'

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'queued',
  'approved',
  'rejected',
  'sending',
  'sent',
  'failed',
  'needs_human',
]

export const LETTER_VARIANTS: readonly LetterVariant[] = ['product', 'outstaff', 'service']
