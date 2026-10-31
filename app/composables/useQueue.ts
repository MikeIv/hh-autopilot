import type {
  DecisionRequest,
  QueueDecision,
  QueueItem,
  QueueResponse,
} from '../../shared/types/queue'

/**
 * Очередь ревью: загрузка списка и решения человека.
 * Отправку в hh делает волна 7 — здесь только запись статуса в базу.
 */
export function useQueue() {
  const queue = useFetch<QueueResponse>('/api/queue', { key: 'review-queue' })
  const deciding = ref<string | null>(null)
  const decisionError = ref<string | null>(null)

  async function decide(item: QueueItem, decision: QueueDecision): Promise<void> {
    deciding.value = item.vacancyId
    decisionError.value = null

    try {
      const body: DecisionRequest = { vacancyId: item.vacancyId, decision }
      await $fetch('/api/queue/decision', { method: 'POST', body })
      await queue.refresh()
    } catch {
      decisionError.value = 'Не удалось сохранить решение — попробуй ещё раз'
    } finally {
      deciding.value = null
    }
  }

  return { queue, deciding, decisionError, decide }
}
