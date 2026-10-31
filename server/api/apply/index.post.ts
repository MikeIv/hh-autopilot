import { ApplyError, assertReadyToSend, logApplyFailure, runApply } from '../../services/apply'
import type { ApplyRequest, ApplyStartResponse } from '../../../shared/types/apply'
import { DAILY_APPLICATION_LIMIT } from '../../../shared/types/queue'

/** Разбирает тело запуска: пустое тело — обычный прогон, поля необязательные. */
function asApplyRequest(body: unknown): ApplyRequest | null {
  if (body === undefined || body === null) {
    return {}
  }
  if (typeof body !== 'object') {
    return null
  }

  const record: Record<string, unknown> = body as Record<string, unknown>
  const dryRun = record.dryRun
  const limit = record.limit

  if (dryRun !== undefined && typeof dryRun !== 'boolean') {
    return null
  }

  if (
    limit !== undefined &&
    (typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > DAILY_APPLICATION_LIMIT)
  ) {
    return null
  }

  return {
    ...(dryRun === undefined ? {} : { dryRun }),
    ...(limit === undefined ? {} : { limit }),
  }
}

/**
 * Запуск отправки одобренных откликов. Сухой прогон считается сразу и возвращает
 * план; живой идёт фоном, чтобы запрос не висел минутами, — состояние отдаёт GET.
 */
export default defineEventHandler(async (event): Promise<ApplyStartResponse> => {
  const request = asApplyRequest(await readBody(event))

  if (!request) {
    throw createError({
      statusCode: 400,
      statusMessage: `Ожидается тело { dryRun?: boolean, limit?: 1–${DAILY_APPLICATION_LIMIT} }`,
    })
  }

  try {
    if (request.dryRun) {
      const result = await runApply({ dryRun: true, limit: request.limit })
      return { started: true, mode: 'dry', dryRun: result }
    }

    await assertReadyToSend()
    void runApply({ dryRun: false, limit: request.limit }).catch((error: unknown) =>
      logApplyFailure(error),
    )

    return { started: true, mode: 'live', dryRun: null }
  } catch (error) {
    if (error instanceof ApplyError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
