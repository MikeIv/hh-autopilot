import { QueueError, submitDecision } from '../../services/queue'
import type { DecisionRequest, QueueDecision } from '../../../shared/types/queue'

const DECISIONS: readonly QueueDecision[] = ['approve', 'reject']

/** Разбирает тело запроса: без zod — полей всего два, ошибка должна быть понятной. */
function asDecisionRequest(body: unknown): DecisionRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const record: Record<string, unknown> = body as Record<string, unknown>
  const { vacancyId, decision } = record

  if (typeof vacancyId !== 'string' || vacancyId.length === 0) {
    return null
  }

  if (typeof decision !== 'string' || !DECISIONS.includes(decision as QueueDecision)) {
    return null
  }

  return { vacancyId, decision: decision as QueueDecision }
}

/** Одобрение или отклонение вакансии из очереди. Дальше отклик отправляет волна 7. */
export default defineEventHandler(async (event) => {
  const request = asDecisionRequest(await readBody(event))

  if (!request) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ожидается vacancyId и decision: approve | reject',
    })
  }

  try {
    const status = await submitDecision(request.vacancyId, request.decision)
    return { status }
  } catch (error) {
    if (error instanceof QueueError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
