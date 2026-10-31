import type {
  ApplyRequest,
  ApplyResult,
  ApplyStartResponse,
  ApplyStatus,
} from '../../shared/types/apply'

/**
 * Прогон отправки: запуск, состояние окна/лимита/panic и остановка.
 * Живой прогон идёт на сервере фоном — счётчики обновляются опросом.
 */
export function useApply() {
  const status = useFetch<ApplyStatus>('/api/apply', { key: 'apply-status' })
  const starting = ref(false)
  const runError = ref<string | null>(null)
  const dryRun = ref<ApplyResult | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  const data = computed<ApplyStatus | null>(() => status.data.value ?? null)
  const active = computed(() => data.value?.active ?? false)

  function stopPolling(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  async function refresh(): Promise<void> {
    await status.refresh()
    if (!active.value) {
      stopPolling()
    }
  }

  function startPolling(): void {
    stopPolling()
    timer = setInterval(() => {
      void refresh()
    }, 3000)
  }

  async function start(dry: boolean): Promise<void> {
    starting.value = true
    runError.value = null
    dryRun.value = null

    try {
      const body: ApplyRequest = { dryRun: dry }
      const result = await $fetch<ApplyStartResponse>('/api/apply', { method: 'POST', body })
      dryRun.value = result.dryRun
      if (result.mode === 'live') {
        startPolling()
      }
      await status.refresh()
    } catch (error) {
      runError.value = errorMessage(error, 'Не удалось запустить прогон')
    } finally {
      starting.value = false
    }
  }

  async function panic(): Promise<void> {
    runError.value = null
    try {
      await $fetch('/api/apply/panic', { method: 'POST' })
      await refresh()
    } catch (error) {
      runError.value = errorMessage(error, 'Не удалось поднять флаг остановки')
    }
  }

  async function releasePanic(): Promise<void> {
    runError.value = null
    try {
      await $fetch('/api/apply/panic', { method: 'DELETE' })
      await refresh()
    } catch (error) {
      runError.value = errorMessage(error, 'Не удалось снять флаг остановки')
    }
  }

  onBeforeUnmount(stopPolling)

  return { status, data, active, starting, runError, dryRun, start, panic, releasePanic, refresh }
}
