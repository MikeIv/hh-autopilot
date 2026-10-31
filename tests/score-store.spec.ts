import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTempDatabase } from './temp-db'
import {
  SCORE_THRESHOLD_KEY,
  readScoreThreshold,
  saveScoreThreshold,
  scoreAllVacancies,
} from '../server/services/scorer'

/**
 * Оценки в базе проверяются на временной базе: миграции те же, портрет — настоящий.
 * Одна оценка на вакансию: повторный прогон обновляет её, а не заводит вторую.
 */
let prisma: PrismaClient
let close: () => Promise<void>

const GOOD = {
  hhId: '300000001',
  title: 'Senior Fullstack-разработчик (Nuxt 4, Vue 3, TypeScript)',
  company: 'Продуктовая компания',
  url: 'https://hh.ru/vacancy/300000001',
  description: 'Бронирование, оплата, личные кабинеты, Nuxt и Nitro.',
  salaryFrom: 250000,
  salaryTo: 300000,
  currency: 'RUR',
  schedule: 'remote',
  experience: '6+',
  source: 'тест',
}

const BAD = {
  hhId: '300000002',
  title: 'Java-разработчик (Spring Boot)',
  company: 'Банк',
  url: 'https://hh.ru/vacancy/300000002',
  description: null,
  salaryFrom: null,
  salaryTo: null,
  currency: null,
  schedule: null,
  experience: '3-6',
  source: 'тест',
}

beforeAll(async () => {
  const db = await openTempDatabase('score')
  prisma = db.client
  close = db.close

  await prisma.vacancy.create({ data: GOOD })
  await prisma.vacancy.create({ data: BAD })
})

afterAll(async () => {
  await close()
})

describe('оценки в базе', () => {
  it('оценивает все вакансии и объясняет вклад каждого критерия', async () => {
    const stats = await scoreAllVacancies(prisma)

    expect(stats).toEqual({ scored: 2, passed: 1, failed: 1, threshold: 65 })

    const scores = await prisma.score.findMany({ orderBy: { total: 'desc' } })
    expect(scores).toHaveLength(2)
    expect(scores[0]?.passed).toBe(true)
    expect(scores[1]?.passed).toBe(false)

    const criteria: unknown = JSON.parse(scores[0]?.criteria ?? '[]')
    expect(Array.isArray(criteria)).toBe(true)
    expect((criteria as unknown[]).length).toBe(5)
  })

  it('не плодит оценки при повторном прогоне', async () => {
    await scoreAllVacancies(prisma)
    const stats = await scoreAllVacancies(prisma)

    expect(stats.scored).toBe(2)
    expect(await prisma.score.count()).toBe(2)
  })

  it('читает порог из настроек и пересчитывает оценки', async () => {
    const before = await prisma.score.findMany({ select: { total: true } })
    const expectedPassed = before.filter((score) => score.total >= 90).length

    await saveScoreThreshold(90, prisma)
    expect(await readScoreThreshold(prisma)).toBe(90)

    const stats = await scoreAllVacancies(prisma)
    expect(stats.threshold).toBe(90)
    expect(stats.passed).toBe(expectedPassed)

    const scores = await prisma.score.findMany({ select: { threshold: true } })
    expect(scores.every((score) => score.threshold === 90)).toBe(true)
  })

  it('не падает на мусоре в настройке порога', async () => {
    await prisma.setting.update({ where: { key: SCORE_THRESHOLD_KEY }, data: { value: 'abc' } })

    expect(await readScoreThreshold(prisma)).toBe(65)
  })

  it('не даёт сохранить порог вне диапазона', async () => {
    await expect(saveScoreThreshold(101, prisma)).rejects.toThrow(/от 0 до 100/)
    await expect(saveScoreThreshold(65.5, prisma)).rejects.toThrow(/от 0 до 100/)
  })
})
