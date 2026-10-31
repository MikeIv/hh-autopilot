import { QueueError, chooseLetterVariant } from '../../services/queue'
import type { LetterChoiceRequest } from '../../../shared/types/queue'
import type { LetterVariant } from '../../../shared/types/domain'
import { LETTER_VARIANTS } from '../../../shared/types/domain'

/** Разбирает тело выбора варианта письма: вакансия и один из трёх вариантов. */
function asLetterChoiceRequest(body: unknown): LetterChoiceRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const record: Record<string, unknown> = body as Record<string, unknown>
  const { vacancyId, variant } = record

  if (typeof vacancyId !== 'string' || vacancyId.length === 0) {
    return null
  }

  if (typeof variant !== 'string' || !LETTER_VARIANTS.includes(variant as LetterVariant)) {
    return null
  }

  return { vacancyId, variant: variant as LetterVariant }
}

/** Выбор варианта письма человеком: текст пересобирается из данных резюме. */
export default defineEventHandler(async (event) => {
  const request = asLetterChoiceRequest(await readBody(event))

  if (!request) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ожидается vacancyId и variant: product | outstaff | service',
    })
  }

  try {
    return await chooseLetterVariant(request.vacancyId, request.variant)
  } catch (error) {
    if (error instanceof QueueError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
