import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { saveCards } from '../server/services/collector'
import { buildSearchUrl, hhArea, hhWorkFormats, searchQueries } from '../shared/utils/hh-search'
import { loadPortrait } from '../server/utils/portrait'
import type { VacancyCard } from '../shared/types/vacancy'
import { openTempDatabase } from './temp-db'

/**
 * Сохранение выдачи проверяется на временной базе: миграции те же, схема та же.
 * Сеть не нужна — карточки собираются руками из тех же полей, что даёт разбор.
 */
function card(hhId: string, overrides: Partial<VacancyCard> = {}): VacancyCard {
  return {
    hhId,
    title: 'Fullstack-разработчик',
    company: 'Тестовая компания',
    url: `https://hh.ru/vacancy/${hhId}`,
    employerUrl: null,
    employerTrusted: false,
    employerRating: null,
    employerReviews: null,
    employerHhRating: false,
    employerHrBrand: false,
    employerLogo: null,
    area: 'Москва',
    salaryFrom: 200000,
    salaryTo: null,
    currency: 'RUR',
    schedule: 'remote',
    experience: '3-6',
    ...overrides,
  }
}

let prisma: PrismaClient
let close: () => Promise<void>

beforeAll(async () => {
  const db = await openTempDatabase('collector')
  prisma = db.client
  close = db.close
})

afterAll(async () => {
  await close()
})

describe('запросы и фильтры из портрета', () => {
  it('выводит запросы из заголовка резюме и ключевых навыков', async () => {
    const portrait = await loadPortrait()

    expect(searchQueries(portrait)).toEqual([
      'Frontend разработчик',
      'Nuxt fullstack разработчик',
      'Nuxt разработчик',
      'Vue разработчик',
    ])
  })

  it('ставит регион Москвы и все три формата из портрета', async () => {
    const portrait = await loadPortrait()
    const url = new URL(buildSearchUrl(portrait, 'Nuxt разработчик'))

    expect(url.origin + url.pathname).toBe('https://hh.ru/search/vacancy')
    expect(url.searchParams.get('text')).toBe('Nuxt разработчик')
    expect(url.searchParams.get('area')).toBe('1')
    expect(url.searchParams.get('work_format')).toBe('REMOTE,HYBRID,ON_SITE')
    expect(url.searchParams.get('items_on_page')).toBe('50')
    expect(url.searchParams.get('page')).toBe('0')
  })

  it('переводит форматы и регион в обозначения hh', () => {
    expect(hhWorkFormats(['remote', 'office'])).toBe('REMOTE,ON_SITE')
    expect(hhArea('Москва')).toBe('1')
    expect(() => hhArea('Казань')).toThrow(/Нет id региона/)
  })

  it('берёт из запроса ровно одну страницу выдачи', async () => {
    const portrait = await loadPortrait()
    const url = new URL(buildSearchUrl(portrait, 'Nuxt разработчик', 2))

    expect(url.searchParams.get('page')).toBe('2')
  })
})

describe('сохранение выдачи', () => {
  it('заводит вакансии и не дублирует их при повторном сборе', async () => {
    const cards = [card('200000001'), card('200000002')]

    const first = await saveCards(cards, 'Nuxt разработчик', prisma)
    expect(first).toEqual({ created: 2, updated: 0, unchanged: 0 })

    const second = await saveCards(cards, 'Nuxt разработчик', prisma)
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 2 })
    expect(await prisma.vacancy.count()).toBe(2)
  })

  it('обновляет вакансию, которую работодатель поправил', async () => {
    const changed = card('200000001', { title: 'Senior Fullstack-разработчик', salaryTo: 300000 })

    const saved = await saveCards([changed], 'Vue разработчик', prisma)
    expect(saved).toEqual({ created: 0, updated: 1, unchanged: 0 })

    const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { hhId: '200000001' } })
    expect(vacancy.title).toBe('Senior Fullstack-разработчик')
    expect(vacancy.salaryTo).toBe(300000)
    expect(vacancy.source).toBe('Vue разработчик')
  })

  it('хранит отпечаток карточки и поисковый запрос', async () => {
    const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { hhId: '200000002' } })

    expect(vacancy.rawHash).toMatch(/^[0-9a-f]{40}$/)
    expect(vacancy.source).toBe('Nuxt разработчик')
    expect(vacancy.schedule).toBe('remote')
    expect(vacancy.experience).toBe('3-6')
    expect(vacancy.employerTrusted).toBe(false)
  })

  it('обновляет вакансию, если изменился рейтинг работодателя', async () => {
    const saved = await saveCards(
      [card('200000002', { employerRating: '4.1', employerReviews: '3 отзыва' })],
      'Nuxt разработчик',
      prisma,
    )

    expect(saved).toEqual({ created: 0, updated: 1, unchanged: 0 })
    const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { hhId: '200000002' } })
    expect(vacancy.employerRating).toBe('4.1')
    expect(vacancy.employerReviews).toBe('3 отзыва')
  })
})
