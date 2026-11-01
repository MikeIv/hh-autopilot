import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTempDatabase } from './temp-db'
import {
  QueueError,
  chooseLetterVariant,
  readQueue,
  submitDecision,
} from '../server/services/queue'
import { generateLetters } from '../server/services/letter'
import { DAILY_APPLICATION_LIMIT } from '../shared/types/queue'
import type { LetterVariant } from '../shared/types/domain'
import { formatSalaryText } from '../shared/utils/queue'

/** Поля карточки вакансии, которых нет в скоринге, но нужны очереди. */
async function createVacancy(
  prisma: PrismaClient,
  hhId: string,
  title: string,
  passed: boolean,
  total: number,
  extra: { salaryFrom?: number; salaryTo?: number; currency?: string; area?: string } = {},
  stack: { reason?: string; matches?: string[] } = {},
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
        {
          key: 'stack',
          weight: 35,
          earned: total / 3,
          reason: stack.reason ?? 'совпали технологии: Nuxt',
          ...(stack.matches ? { matches: stack.matches } : {}),
        },
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
    await prisma.vacancy.update({
      where: { id: first.id },
      data: {
        employerUrl: 'https://hh.ru/employer/1',
        employerTrusted: true,
        employerRating: '4.8',
        employerReviews: '12 отзывов',
        employerHhRating: true,
        employerHrBrand: false,
        employerLogo: 'https://img.hhcdn.ru/employer-logo/1.png',
      },
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
    expect(first?.employer).toEqual({
      url: 'https://hh.ru/employer/1',
      trusted: true,
      rating: '4.8',
      reviews: '12 отзывов',
      hhRating: true,
      hrBrand: false,
      logo: 'https://img.hhcdn.ru/employer-logo/1.png',
    })
    expect(first?.letter?.variant).toBe('product')
    expect(first?.status).toBe('queued')
    expect(second?.letter).toBeNull()
    expect(first?.score.criteria[0]?.reason).toContain('Nuxt')
    expect(first?.nuxtStack).toEqual(['Nuxt'])
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

describe('порядок выдачи', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('queue-order')
    prisma = db.client
    close = db.close

    await createVacancy(
      prisma,
      '520000001',
      'DevOps инженер',
      true,
      95,
      {},
      {
        reason: 'совпали технологии портрета, без стека Nuxt: Git, Docker',
        matches: ['Git', 'Docker', 'HTML'],
      },
    )
    await createVacancy(
      prisma,
      '520000002',
      'Vue разработчик',
      true,
      72,
      {},
      {
        matches: ['Vue', 'TypeScript'],
      },
    )
    await createVacancy(
      prisma,
      '520000003',
      'Nuxt fullstack разработчик',
      true,
      68,
      {},
      {
        matches: ['Nuxt', 'Vue', 'TypeScript', 'Nitro'],
      },
    )
  })

  afterAll(async () => {
    await close()
  })

  it('ставит совпадения стека Nuxt выше более высокой оценки без Nuxt', async () => {
    const queue = await readQueue(prisma)

    expect(queue.items.map((item) => item.hhId)).toEqual(['520000003', '520000002', '520000001'])
    expect(queue.items[0]?.nuxtStack).toEqual(['Nuxt', 'Vue', 'Nitro'])
    expect(queue.items[2]?.nuxtStack).toEqual([])
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

describe('вариант письма в очереди', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>
  let vacancyId: string
  let sentVacancyId: string

  beforeAll(async () => {
    const db = await openTempDatabase('queue-letter')
    prisma = db.client
    close = db.close

    const vacancy = await prisma.vacancy.create({
      data: {
        hhId: '510000001',
        title: 'Senior Fullstack (Nuxt)',
        company: 'Платформа',
        url: 'https://hh.ru/vacancy/510000001',
        source: 'тест',
      },
    })
    await prisma.score.create({
      data: { vacancyId: vacancy.id, total: 90, threshold: 65, passed: true, criteria: '[]' },
    })
    vacancyId = vacancy.id

    const sent = await prisma.vacancy.create({
      data: {
        hhId: '510000002',
        title: 'Fullstack в аутстафф',
        company: 'Подрядчик',
        url: 'https://hh.ru/vacancy/510000002',
        source: 'тест',
      },
    })
    await prisma.score.create({
      data: { vacancyId: sent.id, total: 80, threshold: 65, passed: true, criteria: '[]' },
    })
    sentVacancyId = sent.id

    await generateLetters(prisma)

    const sentLetter = await prisma.letter.findUniqueOrThrow({ where: { vacancyId: sent.id } })
    await prisma.application.create({
      data: {
        vacancyId: sent.id,
        letterId: sentLetter.id,
        status: 'sent',
        approvedAt: new Date(),
        sentAt: new Date(),
      },
    })
  })

  afterAll(async () => {
    await close()
  })

  it('сохраняет выбор человека, и генерация его не перетирает', async () => {
    const draft = await chooseLetterVariant(vacancyId, 'outstaff', prisma)

    expect(draft.variant).toBe('outstaff')

    const saved = await prisma.letter.findUniqueOrThrow({ where: { vacancyId } })
    expect(saved.variant).toBe('outstaff')
    expect(saved.body).toBe(draft.body)
    expect(saved.selectedAt).toBeInstanceOf(Date)

    const stats = await generateLetters(prisma)
    expect(stats.kept).toBe(1)
    expect(stats.generated).toBe(1)

    const kept = await prisma.letter.findUniqueOrThrow({ where: { vacancyId } })
    expect(kept.variant).toBe('outstaff')
    expect(kept.body).toBe(draft.body)
  })

  it('не принимает неизвестный вариант письма', async () => {
    await expect(
      chooseLetterVariant(vacancyId, 'weird' as unknown as LetterVariant, prisma),
    ).rejects.toBeInstanceOf(QueueError)
  })

  it('не даёт менять вариант после отправки', async () => {
    await expect(chooseLetterVariant(sentVacancyId, 'service', prisma)).rejects.toThrow(
      'уже отправлен',
    )
  })

  it('одобрение связывает письмо с откликом, отправленный отклик не решается повторно', async () => {
    const status = await submitDecision(vacancyId, 'approve', prisma)
    expect(status).toBe('approved')

    const application = await prisma.application.findUniqueOrThrow({ where: { vacancyId } })
    const letter = await prisma.letter.findUniqueOrThrow({ where: { vacancyId } })
    expect(application.letterId).toBe(letter.id)

    await expect(submitDecision(sentVacancyId, 'approve', prisma)).rejects.toThrow('уже отправлен')
  })

  it('отдаёт все три варианта письма и выбранный', async () => {
    const queue = await readQueue(prisma)
    const item = queue.items.find((row) => row.vacancyId === vacancyId)

    expect(item?.letter?.variants.map((draft) => draft.variant)).toEqual([
      'product',
      'outstaff',
      'service',
    ])
    expect(item?.letter?.variant).toBe('outstaff')
    expect(item?.letter?.chosen).toBe(true)
    expect(item?.letter?.variants.find((draft) => draft.recommended)?.variant).toBe('product')
    expect(item?.status).toBe('approved')
  })
})
