import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import { loadPortrait } from '../utils/portrait'
import type { QueueDecision, QueueItem, QueueLetter, QueueResponse } from '../../shared/types/queue'
import { DAILY_APPLICATION_LIMIT } from '../../shared/types/queue'
import type { ScoreCriterion } from '../../shared/types/score'
import type { ApplicationStatus, LetterVariant } from '../../shared/types/domain'
import { LETTER_VARIANTS } from '../../shared/types/domain'
import type { LetterDraft } from '../../shared/types/letter'
import { buildLetter, detectVariant, letterVariants } from '../../shared/utils/letter'
import { formatSalaryText } from '../../shared/utils/queue'
import { compareNuxtStackFirst, nuxtStackLabels } from '../../shared/utils/scorer'
import { startOfMskDay } from '../../shared/utils/apply'

/** Ошибка очереди: обработчик API превращает её в статус ответа. */
export class QueueError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'QueueError'
    this.statusCode = statusCode
  }
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

/** Письмо в очереди: текущий вариант и все три для переключения человеком. */
function buildQueueLetter(
  letter: { variant: string; body: string; charCount: number; selectedAt: Date | null },
  drafts: readonly LetterDraft[],
  recommended: LetterVariant,
): QueueLetter {
  return {
    variant: letter.variant as LetterVariant,
    body: letter.body,
    charCount: letter.charCount,
    chosen: letter.selectedAt !== null,
    variants: drafts.map((draft) => ({
      variant: draft.variant,
      body: draft.body,
      charCount: draft.charCount,
      recommended: draft.variant === recommended,
    })),
  }
}

/** Очередь ревью: прошедшие порог вакансии, их оценки, письма и статусы. */
export async function readQueue(client: PrismaClient = prisma): Promise<QueueResponse> {
  const [scores, portrait] = await Promise.all([
    client.score.findMany({
      where: { passed: true },
      orderBy: { total: 'desc' },
      include: { vacancy: { include: { letter: true, application: true } } },
    }),
    loadPortrait(),
  ])

  const start = startOfMskDay(new Date())
  const [approvedToday, sentToday] = await Promise.all([
    client.application.count({ where: { status: 'approved', approvedAt: { gte: start } } }),
    client.application.count({ where: { status: 'sent', sentAt: { gte: start } } }),
  ])

  const items: QueueItem[] = scores.map((score) => {
    const vacancy = score.vacancy
    const vacancyForLetter = {
      title: vacancy.title,
      company: vacancy.company,
      description: vacancy.description,
    }
    const drafts = vacancy.letter ? letterVariants(portrait, vacancyForLetter) : []
    const criteria = parseCriteria(score.criteria)

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
        criteria,
      },
      nuxtStack: nuxtStackLabels(criteria),
      letter: vacancy.letter
        ? buildQueueLetter(vacancy.letter, drafts, detectVariant(vacancyForLetter))
        : null,
      status: (vacancy.application?.status ?? 'queued') as ApplicationStatus,
      approvedAt: vacancy.application?.approvedAt?.toISOString() ?? null,
      sentAt: vacancy.application?.sentAt?.toISOString() ?? null,
      error: vacancy.application?.error ?? null,
    }
  })

  items.sort((left, right) =>
    compareNuxtStackFirst(
      { total: left.score.total, nuxtStack: left.nuxtStack },
      { total: right.score.total, nuxtStack: right.nuxtStack },
    ),
  )

  return {
    threshold: scores[0]?.threshold ?? 0,
    dailyLimit: DAILY_APPLICATION_LIMIT,
    approvedToday,
    sentToday,
    items,
  }
}

/** Решение человека: одобрить или отклонить. Отправка — отдельный прогон apply. */
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

  const current = await client.application.findUnique({ where: { vacancyId } })
  if (current && (current.status === 'sent' || current.status === 'sending')) {
    throw new QueueError(409, 'Отклик уже отправлен — решение по нему не меняется')
  }

  const letter = await client.letter.findUnique({ where: { vacancyId } })
  const status: ApplicationStatus = decision === 'approve' ? 'approved' : 'rejected'
  const approvedAt = decision === 'approve' ? new Date() : null

  const application = await client.application.upsert({
    where: { vacancyId },
    create: {
      vacancyId,
      status,
      approvedAt,
      letterId: decision === 'approve' ? (letter?.id ?? null) : null,
    },
    update: {
      status,
      approvedAt,
      // Повторное одобрение после ошибки или остановки возвращает карточку в работу.
      error: null,
      ...(decision === 'approve' && letter ? { letterId: letter.id } : {}),
    },
  })

  return application.status as ApplicationStatus
}

/**
 * Выбор варианта письма человеком. Текст пересобирается из тех же данных резюме,
 * выбор запоминается в `Letter.selectedAt`: повторная генерация его не перетирает.
 */
export async function chooseLetterVariant(
  vacancyId: string,
  variant: LetterVariant,
  client: PrismaClient = prisma,
): Promise<LetterDraft> {
  if (!LETTER_VARIANTS.includes(variant)) {
    throw new QueueError(400, `Неизвестный вариант письма: ${variant}`)
  }

  const vacancy = await client.vacancy.findUnique({
    where: { id: vacancyId },
    include: { letter: true, application: true },
  })

  if (!vacancy?.letter) {
    throw new QueueError(404, 'Письмо для вакансии не собрано — сначала прогони pnpm hh:letters')
  }

  if (vacancy.application?.status === 'sent' || vacancy.application?.status === 'sending') {
    throw new QueueError(409, 'Отклик уже отправлен — вариант письма менять поздно')
  }

  const portrait = await loadPortrait()
  const draft = buildLetter(
    portrait,
    {
      title: vacancy.title,
      company: vacancy.company,
      description: vacancy.description,
    },
    variant,
  )

  await client.letter.update({
    where: { vacancyId },
    data: {
      variant: draft.variant,
      body: draft.body,
      charCount: draft.charCount,
      selectedAt: new Date(),
    },
  })

  return draft
}
