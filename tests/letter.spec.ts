import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTempDatabase } from './temp-db'
import { generateLetters } from '../server/services/letter'
import { loadPortrait } from '../server/utils/portrait'
import {
  LETTER_MAX_CHARS,
  buildLetter,
  detectVariant,
  letterVariants,
  recommendedLetter,
} from '../shared/utils/letter'
import type { CandidatePortrait } from '../shared/types/portrait'

/** Портрет для проверки фактов: всё уникальное, чтобы поймать выдуманное. */
const PORTRAIT: CandidatePortrait = {
  basics: {
    label: 'Zeta fullstack разработчик',
    summary: 'Тестовый кандидат.',
    location: { city: 'Москва', countryCode: 'RU' },
    formats: ['remote'],
    salary: { amount: 100000, currency: 'RUR', period: 'month' },
  },
  experience: [
    {
      company: 'ООО Ромашка',
      position: 'Ведущий инженер',
      from: '2020-01',
      to: null,
      summary: 'Продукт.',
      achievements: ['Сделал продукт.'],
      stack: ['Nuxt'],
    },
    {
      company: 'ООО Лютик',
      position: 'Инженер',
      from: '2018-01',
      to: '2019-12',
      summary: 'Сервис.',
      achievements: ['Сделал сервис.'],
      stack: ['Vue'],
    },
  ],
  skills: [{ group: 'Стек', items: ['Nuxt', 'Vue'] }],
  hh: {
    keywords: ['Nuxt', 'Vue'],
    portrait: { domain: 'Домен', product: 'Продукт', team: 'Команда', process: 'Процесс' },
  },
}

const idea = {
  title: 'Senior Fullstack-разработчик (Nuxt 4, Vue 3, TypeScript)',
  company: 'Платформа',
  description: null,
}

describe('письма из данных резюме', () => {
  it('собирает три варианта в пределах лимита и с длиной в знаках', async () => {
    const portrait = await loadPortrait()
    const drafts = letterVariants(portrait, idea)

    expect(drafts.map((draft) => draft.variant)).toEqual(['product', 'outstaff', 'service'])
    for (const draft of drafts) {
      expect(draft.body.length).toBeLessThanOrEqual(LETTER_MAX_CHARS)
      expect(draft.charCount).toBe(draft.body.length)
      expect(draft.body.length).toBeGreaterThan(300)
    }
    expect(new Set(drafts.map((draft) => draft.body)).size).toBe(3)
  })

  it('берёт компанию и стек из вакансии и портрета, а не из воздуха', async () => {
    const portrait = await loadPortrait()
    const draft = recommendedLetter(portrait, idea)

    expect(draft.body).toContain('Nuxt')
    expect(draft.body).toContain('Платформа')
    expect(draft.body).toContain(portrait.experience[0]?.company ?? 'нет компании')
  })

  it('выбирает вариант по типу вакансии', () => {
    expect(detectVariant({ ...idea, title: 'Fullstack-разработчик в аутстафф-команду' })).toBe(
      'outstaff',
    )
    expect(detectVariant({ ...idea, title: 'Разработчик в веб-студию' })).toBe('service')
    expect(detectVariant({ ...idea, title: 'Разработчик SaaS-платформы' })).toBe('product')
    expect(detectVariant({ ...idea, title: 'Разработчик' })).toBe('product')
  })

  it('не выдумывает цифры, которых нет в резюме и вакансии', () => {
    const allowed = JSON.stringify(PORTRAIT) + idea.title
    const numeric = /[0-9]+/g

    for (const variant of ['product', 'outstaff', 'service'] as const) {
      const body = buildLetter(PORTRAIT, idea, variant).body
      const numbers = body.match(numeric) ?? []
      for (const number of numbers) {
        expect(allowed).toContain(number)
      }
    }
  })

  it('не вставляет почту, телефон и ссылки', async () => {
    const portrait = await loadPortrait()

    for (const draft of letterVariants(portrait, idea)) {
      expect(draft.body).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
      expect(draft.body).not.toMatch(/\+7\s?\(?\d{3}/)
      expect(draft.body).not.toMatch(/https?:\/\//)
    }
  })

  it('обрезает письмо по лимиту, не разрывая абзацы посередине', () => {
    const long = { ...idea, title: `Разработчик ${'оченьдлинноеслово '.repeat(200)}` }
    const draft = buildLetter(PORTRAIT, long, 'product')

    expect(draft.body.length).toBeLessThanOrEqual(LETTER_MAX_CHARS)
    expect(draft.body.startsWith('Здравствуйте!')).toBe(true)
  })
})

describe('письма в базе', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('letter')
    prisma = db.client
    close = db.close

    const vacancy = await prisma.vacancy.create({
      data: {
        hhId: '400000001',
        title: 'Senior Fullstack-разработчик (Nuxt 4, Vue 3, TypeScript)',
        company: 'Платформа',
        url: 'https://hh.ru/vacancy/400000001',
        source: 'тест',
      },
    })
    await prisma.score.create({
      data: { vacancyId: vacancy.id, total: 90, threshold: 65, passed: true, criteria: '[]' },
    })

    const skipped = await prisma.vacancy.create({
      data: {
        hhId: '400000002',
        title: 'Java-разработчик',
        company: 'Банк',
        url: 'https://hh.ru/vacancy/400000002',
        source: 'тест',
      },
    })
    await prisma.score.create({
      data: { vacancyId: skipped.id, total: 30, threshold: 65, passed: false, criteria: '[]' },
    })
  })

  afterAll(async () => {
    await close()
  })

  it('пишет письмо только прошедшим порог и не плодит его при повторе', async () => {
    const first = await generateLetters(prisma)

    expect(first.generated).toBe(1)
    expect(await prisma.letter.count()).toBe(1)

    await generateLetters(prisma)
    expect(await prisma.letter.count()).toBe(1)

    const letter = await prisma.letter.findFirstOrThrow({ include: { vacancy: true } })
    expect(letter.vacancy.hhId).toBe('400000001')
    expect(letter.charCount).toBe(letter.body.length)
    expect(letter.charCount).toBeLessThanOrEqual(LETTER_MAX_CHARS)
  })
})
