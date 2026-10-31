import { ApplyError, sendApprovedNow } from '../../services/apply'
import type { ManualSendRequest, ManualSendResponse } from '../../../shared/types/apply'

/** Разбирает тело ручной отправки: одно поле, ошибка должна быть понятной. */
function asManualSendRequest(body: unknown): ManualSendRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const { vacancyId } = body as Record<string, unknown>
  if (typeof vacancyId !== 'string' || vacancyId.length === 0) {
    return null
  }

  return { vacancyId }
}

/** «Отправить сейчас»: одна одобренная карточка, но под теми же лимитами и окном. */
export default defineEventHandler(async (event): Promise<ManualSendResponse> => {
  const request = asManualSendRequest(await readBody(event))

  if (!request) {
    throw createError({ statusCode: 400, statusMessage: 'Ожидается vacancyId одобренного отклика' })
  }

  try {
    return await sendApprovedNow(request.vacancyId)
  } catch (error) {
    if (error instanceof ApplyError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
