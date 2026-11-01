import type { RefreshStatus } from '../../shared/types/refresh'
import type { QueueResponse } from '../../shared/types/queue'
import { formatRefreshResult } from '#shared/utils/refresh'

/**
 * Обновление выдачи с hh: кнопка запускает прогон, страница опрашивает его
 * и после окончания заново читает очередь.
 */
export function useRefresh() {
  const status = useFetch<RefreshStatus>('/api/refresh', { key: 'hh-refresh' })
  const queue = useFetch<QueueResponse>('/api/queue', { key: 'review-queue' })
  const starting = ref(false)
  const refreshError = ref<string | null>(null)
  const refreshNote = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let seenFinishedAt: string | null = null

  const refreshing = computed(() => starting.value || Boolean(status.data.value?.running))
  /** Когда выдача последний раз обновилась успешно — для подписи у кнопки. */
  const lastRefreshAt = computed(() => status.data.value?.finishedAt ?? null)

  function stopPolling(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  async function pull(): Promise<void> {
    try {
      await status.refresh()
    } catch {
      return
    }

    const current = status.data.value
    if (!current || current.running) {
      return
    }

    stopPolling()
    if (!current.finishedAt || current.finishedAt === seenFinishedAt) {
      return
    }

    seenFinishedAt = current.finishedAt
    if (current.error) {
      refreshError.value = current.error
      refreshNote.value = null
      return
    }

    if (current.result) {
      refreshError.value = null
      refreshNote.value = formatRefreshResult(current.result)
      await queue.refresh()
    }
  }

  function startPolling(): void {
    stopPolling()
    timer = setInterval(() => {
      void pull()
    }, 2000)
  }

  async function refreshFromHh(): Promise<void> {
    seenFinishedAt = status.data.value?.finishedAt ?? seenFinishedAt
    starting.value = true
    refreshError.value = null
    refreshNote.value = null

    try {
      await $fetch<RefreshStatus>('/api/refresh', { method: 'POST' })
      await status.refresh()
      startPolling()
      await pull()
    } catch (error) {
      refreshError.value = errorMessage(error, 'Не удалось запустить обновление выдачи hh')
    } finally {
      starting.value = false
    }
  }

  watch(
    () => status.data.value?.running,
    (running) => {
      if (running) {
        startPolling()
      }
    },
  )

  onMounted(() => {
    if (status.data.value?.running) {
      startPolling()
      return
    }

    seenFinishedAt = status.data.value?.finishedAt ?? null
  })

  onBeforeUnmount(stopPolling)

  return { refreshing, lastRefreshAt, refreshError, refreshNote, refreshFromHh }
}
