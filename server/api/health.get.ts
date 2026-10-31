import { prisma } from '../utils/db'

/** Проверка связки «сервер → база → схема»: UI и первый прогон опираются на неё. */
export default defineEventHandler(async () => {
  const vacancies = await prisma.vacancy.count()

  return { ok: true, vacancies }
})
