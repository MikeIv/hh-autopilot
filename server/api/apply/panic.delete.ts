import { clearPanic } from '../../services/apply'

/** Снятие panic: человек осознанно разрешает следующий прогон. */
export default defineEventHandler(async () => {
  await clearPanic()
  return { panicAt: null }
})
