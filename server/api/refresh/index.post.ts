import { RefreshError, startRefresh } from '../../services/refresh'

/** Запускает сбор выдачи hh, скоринг и письма. Ответ приходит сразу, прогон идёт на сервере. */
export default defineEventHandler(async () => {
  try {
    return await startRefresh()
  } catch (error) {
    if (error instanceof RefreshError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
