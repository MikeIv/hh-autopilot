import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import type { QueueDecision, QueueItem, QueueResponse } from '../../shared/types/queue'
import { DAILY_APPLICATION_LIMIT } from '../../shared/types/queue'
import type { ScoreCriterion } from '../../shared/types/score'
import type { ApplicationStatus, LetterVariant } from '../../shared/types/domain'
import { formatSalaryText } from '../../shared/utils/queue'

/** Ошибка очереди: обработчик API превращает её в статус ответа. */
export class QueueError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'QueueError'
    this.statusCode = statusCode
  }
}

/** Начало сегодняшнего дня — граница счётчиков дневного лимита. */
function startOfToday(now = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

/** Критерии из базы: строка JSON, писалась только нами. */
function parseCriteria(raw: string): ScoreCriterion[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ScoreCriterion[]) : []
  } catch {
    return []
  }
}

/** Очередь ревью: прошедшие порог вакансии, их оценки, письма и статусы. */
export async function readQueue(client: PrismaClient = prisma): Promise<QueueResponse> {
  const scores = await client.score.findMany({
    where: { passed: true },
    orderBy: { total: 'desc' },
    include: { vacancy: { include: { letter: true, application: true } } },
  })

  const start = startOfToday()
  const [approvedToday, sentToday] = await Promise.all([
    client.application.count({ where: { status: 'approved', approvedAt: { gte: start } } }),
    client.application.count({ where: { status: 'sent', sentAt: { gte: start } } }),
  ])

  const items: QueueItem[] = scores.map((score) => {
    const vacancy = score.vacancy

    return {
      vacancyId: vacancy.id,
      hhId: vacancy.hhId,
      title: vacancy.title,
      company: vacancy.company,
      url: vacancy.url,
      area: vacancy.area,
      salary: formatSalaryText(vacancy.salaryFrom, vacancy.salaryTo, vacancy.currency),
      score: {
        total: score.total,
        threshold: score.threshold,
        passed: score.passed,
        criteria: parseCriteria(score.criteria),
      },
      letter: vacancy.letter
        ? {
            variant: vacancy.letter.variant as LetterVariant,
            body: vacancy.letter.body,
            charCount: vacancy.letter.charCount,
          }
        : null,
      status: (vacancy.application?.status ?? 'queued') as ApplicationStatus,
    }
  })

  return {
    threshold: scores[0]?.threshold ?? 0,
    dailyLimit: DAILY_APPLICATION_LIMIT,
    approvedToday,
    sentToday,
    items,
  }
}

/** Решение человека: одобрить или отклонить. Отправка в hh — волна 7. */
export async function submitDecision(
  vacancyId: string,
  decision: QueueDecision,
  client: PrismaClient = prisma,
): Promise<ApplicationStatus> {
  const score = await client.score.findUnique({ where: { vacancyId } })

  if (!score) {
    throw new QueueError(404, 'Вакансия не оценена — сначала прогони скоринг')
  }

  if (!score.passed) {
    throw new QueueError(409, 'Вакансия не прошла порог оценки')
  }

  const status: ApplicationStatus = decision === 'approve' ? 'approved' : 'rejected'
  const approvedAt = decision === 'approve' ? new Date() : null

  const application = await client.application.upsert({
    where: { vacancyId },
    create: { vacancyId, status, approvedAt },
    update: { status, approvedAt },
  })

  return application.status as ApplicationStatus
}
