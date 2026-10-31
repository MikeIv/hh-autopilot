import { raisePanic } from '../../services/apply'

/** Panic: немедленно прекращает текущий прогон и запрещает следующий. */
export default defineEventHandler(async () => {
  const panicAt = await raisePanic()
  return { panicAt: panicAt.toISOString() }
})
