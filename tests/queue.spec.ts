import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTempDatabase } from './temp-db'
import { QueueError, readQueue, submitDecision } from '../server/services/queue'
import { DAILY_APPLICATION_LIMIT } from '../shared/types/queue'
import { formatSalaryText } from '../shared/utils/queue'

/** Поля карточки вакансии, которых нет в скоринге, но нужны очереди. */
async function createVacancy(
  prisma: PrismaClient,
  hhId: string,
  title: string,
  passed: boolean,
  total: number,
  extra: { salaryFrom?: number; salaryTo?: number; currency?: string; area?: string } = {},
) {
  const vacancy = await prisma.vacancy.create({
    data: {
      hhId,
      title,
      company: 'Компания',
      url: `https://hh.ru/vacancy/${hhId}`,
      ...extra,
      source: 'тест',
    },
  })

  await prisma.score.create({
    data: {
      vacancyId: vacancy.id,
      total,
      threshold: 65,
      passed,
      criteria: JSON.stringify([
        { key: 'stack', weight: 35, earned: total / 3, reason: 'совпали технологии: Nuxt' },
      ]),
    },
  })

  return vacancy
}

/** Пробелы в Intl — неразрывные; в проверках сравниваем обычными. */
function plain(value: string | null): string | null {
  return value?.replace(/\u00a0/g, ' ') ?? null
}

describe('очередь ревью', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('queue')
    prisma = db.client
    close = db.close

    const first = await createVacancy(prisma, '500000001', 'Senior Fullstack (Nuxt)', true, 90, {
      salaryFrom: 250000,
      salaryTo: 350000,
      currency: 'RUR',
      area: 'Москва',
    })
    await prisma.letter.create({
      data: { vacancyId: first.id, variant: 'product', body: 'Здравствуйте!', charCount: 14 },
    })

    await createVacancy(prisma, '500000002', 'Frontend разработчик (Vue)', true, 70)
    await createVacancy(prisma, '500000003', 'Java-разработчик', false, 30)
  })

  afterAll(async () => {
    await close()
  })

  it('отдаёт только прошедших порог, по убыванию оценки, с письмом и статусом', async () => {
    const queue = await readQueue(prisma)

    expect(queue.items.map((item) => item.hhId)).toEqual(['500000001', '500000002'])
    expect(queue.dailyLimit).toBe(DAILY_APPLICATION_LIMIT)
    expect(queue.threshold).toBe(65)

    const [first, second] = queue.items
    expect(plain(first?.salary ?? null)).toBe('250 000 – 350 000 ₽')
    expect(first?.area).toBe('Москва')
    expect(first?.letter?.variant).toBe('product')
    expect(first?.status).toBe('queued')
    expect(second?.letter).toBeNull()
    expect(first?.score.criteria[0]?.reason).toContain('Nuxt')
  })

  it('одобряет и отклоняет, обновляя решение без дублей', async () => {
    const first = await prisma.vacancy.findFirstOrThrow({ where: { hhId: '500000001' } })
    const second = await prisma.vacancy.findFirstOrThrow({ where: { hhId: '500000002' } })

    expect(await submitDecision(first.id, 'approve', prisma)).toBe('approved')
    expect(await submitDecision(second.id, 'reject', prisma)).toBe('rejected')
    expect(await submitDecision(first.id, 'reject', prisma)).toBe('rejected')

    const queue = await readQueue(prisma)
    expect(queue.items.find((item) => item.hhId === '500000001')?.status).toBe('rejected')
    expect(queue.approvedToday).toBe(0)
    expect(await prisma.application.count()).toBe(2)
  })

  it('не даёт решать по вакансии без оценки или ниже порога', async () => {
    const passed = await prisma.vacancy.findFirstOrThrow({ where: { hhId: '500000001' } })
    const failed = await prisma.vacancy.findFirstOrThrow({ where: { hhId: '500000003' } })
    const unknown = await createVacancy(prisma, '500000004', 'Без оценки', false, 0)

    await prisma.score.delete({ where: { vacancyId: unknown.id } })

    await expect(submitDecision(failed.id, 'approve', prisma)).rejects.toBeInstanceOf(QueueError)
    await expect(submitDecision(unknown.id, 'approve', prisma)).rejects.toThrow(/не оценена/)
    expect(await prisma.application.count()).toBe(2)

    await expect(submitDecision(passed.id, 'reject', prisma)).resolves.toBe('rejected')
  })
})

describe('зарплата в карточке', () => {
  it('форматирует вилку, одну границу и отсутствие', () => {
    expect(plain(formatSalaryText(250000, 350000, 'RUR'))).toBe('250 000 – 350 000 ₽')
    expect(plain(formatSalaryText(200000, null, 'RUR'))).toBe('от 200 000 ₽')
    expect(plain(formatSalaryText(null, 300000, 'USD'))).toBe('до 300 000 $')
    expect(plain(formatSalaryText(5000, 5000, 'EUR'))).toBe('5 000 €')
    expect(formatSalaryText(null, null, 'RUR')).toBeNull()
  })
})
