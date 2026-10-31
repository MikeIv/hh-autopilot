import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import { loadPortrait } from '../utils/portrait'
import { DEFAULT_SCORE_THRESHOLD, scoreVacancy } from '../../shared/utils/scorer'

/** Ключ настройки порога отсечения: его правят человек из UI и CLI. */
export const SCORE_THRESHOLD_KEY = 'score.threshold'

export interface ScoreStats {
  scored: number
  passed: number
  failed: number
  threshold: number
}

/** Порог из настроек; мусор в значении — не повод падать, вернём порог по умолчанию. */
export async function readScoreThreshold(client: PrismaClient = prisma): Promise<number> {
  const setting = await client.setting.findUnique({ where: { key: SCORE_THRESHOLD_KEY } })
  const value = setting ? Number(setting.value) : Number.NaN
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : DEFAULT_SCORE_THRESHOLD
}

/** Сохраняет новый порог в настройках: одна запись на ключ. */
export async function saveScoreThreshold(
  value: number,
  client: PrismaClient = prisma,
): Promise<void> {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`Порог — целое число от 0 до 100, получено: ${value}`)
  }

  await client.setting.upsert({
    where: { key: SCORE_THRESHOLD_KEY },
    create: { key: SCORE_THRESHOLD_KEY, value: String(value) },
    update: { value: String(value) },
  })
}

/**
 * Оценивает все вакансии в базе объяснимым скорингом и обновляет их оценки.
 * Одна оценка на вакансию: повторный прогон обновляет её, а не плодит строки.
 */
export async function scoreAllVacancies(
  client: PrismaClient = prisma,
  options: { threshold?: number } = {},
): Promise<ScoreStats> {
  const portrait = await loadPortrait()
  const threshold = options.threshold ?? (await readScoreThreshold(client))
  const vacancies = await client.vacancy.findMany()

  let passed = 0
  for (const vacancy of vacancies) {
    const result = scoreVacancy(portrait, vacancy, threshold)
    const criteria = JSON.stringify(result.criteria)

    await client.score.upsert({
      where: { vacancyId: vacancy.id },
      create: {
        vacancyId: vacancy.id,
        total: result.total,
        threshold,
        passed: result.passed,
        criteria,
      },
      update: {
        total: result.total,
        threshold,
        passed: result.passed,
        criteria,
        scoredAt: new Date(),
      },
    })

    if (result.passed) {
      passed += 1
    }
  }

  return { scored: vacancies.length, passed, failed: vacancies.length - passed, threshold }
}
