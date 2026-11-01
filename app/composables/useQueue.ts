import type {
  DecisionRequest,
  LetterChoiceRequest,
  QueueDecision,
  QueueItem,
  QueueResponse,
} from '../../shared/types/queue'
import type { LetterVariant } from '../../shared/types/domain'
import type { ManualSendRequest, ManualSendResponse } from '../../shared/types/apply'

/**
 * Очередь ревью: загрузка списка, решения человека, выбор варианта письма
 * и ручная отправка одной карточки под теми же лимитами, что и прогон.
 */
export function useQueue() {
  const queue = useFetch<QueueResponse>('/api/queue', { key: 'review-queue' })
  const deciding = ref<string | null>(null)
  const decisionKind = ref<QueueDecision | null>(null)
  const choosing = ref<string | null>(null)
  const letterVariant = ref<LetterVariant | null>(null)
  const sending = ref<string | null>(null)
  const decisionError = ref<string | null>(null)
  const notice = ref<string | null>(null)

  async function decide(item: QueueItem, decision: QueueDecision): Promise<void> {
    deciding.value = item.vacancyId
    decisionKind.value = decision
    decisionError.value = null
    notice.value = null

    try {
      const body: DecisionRequest = { vacancyId: item.vacancyId, decision }
      await $fetch('/api/queue/decision', { method: 'POST', body })
      await queue.refresh()
    } catch (error) {
      decisionError.value = errorMessage(error, 'Не удалось сохранить решение — попробуй ещё раз')
    } finally {
      deciding.value = null
      decisionKind.value = null
    }
  }

  async function chooseVariant(item: QueueItem, variant: LetterVariant): Promise<void> {
    choosing.value = item.vacancyId
    letterVariant.value = variant
    decisionError.value = null
    notice.value = null

    try {
      const body: LetterChoiceRequest = { vacancyId: item.vacancyId, variant }
      await $fetch('/api/queue/letter', { method: 'POST', body })
      await queue.refresh()
    } catch (error) {
      decisionError.value = errorMessage(error, 'Не удалось сохранить вариант письма')
    } finally {
      choosing.value = null
      letterVariant.value = null
    }
  }

  async function sendNow(item: QueueItem): Promise<void> {
    sending.value = item.vacancyId
    decisionError.value = null
    notice.value = null

    try {
      const body: ManualSendRequest = { vacancyId: item.vacancyId }
      const result = await $fetch<ManualSendResponse>('/api/apply/send', { method: 'POST', body })
      notice.value = result.message
      await queue.refresh()
    } catch (error) {
      decisionError.value = errorMessage(error, 'Не удалось отправить отклик — попробуй ещё раз')
      await queue.refresh()
    } finally {
      sending.value = null
    }
  }

  return {
    queue,
    deciding,
    decisionKind,
    choosing,
    letterVariant,
    sending,
    decisionError,
    notice,
    decide,
    chooseVariant,
    sendNow,
  }
}
