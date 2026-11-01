import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSerpPage } from '../shared/utils/serp'

/** Живые страницы выдачи hh, снятые сохранённой сессией: разбор проверяется без сети. */
const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'serp')

const read = (name: string): Promise<string> => readFile(join(FIXTURES, `${name}.html`), 'utf8')

describe('разбор выдачи hh', () => {
  it('находит карточки и берёт заголовок, компанию, адрес, формат и опыт', async () => {
    const cards = parseSerpPage(await read('nuxt-label'))

    expect(cards).toHaveLength(3)
    expect(cards[0]).toEqual({
      hhId: '138950534',
      title: 'Senior Fullstack-разработчик (Laravel + Nuxt)',
      company: 'Easy From China',
      url: 'https://hh.ru/vacancy/138950534',
      employerUrl: 'https://hh.ru/employer/10844339',
      employerTrusted: true,
      employerRating: '5.0',
      employerReviews: '1 отзыв',
      employerHhRating: false,
      employerHrBrand: false,
      employerLogo: null,
      area: 'Москва',
      salaryFrom: 200000,
      salaryTo: null,
      currency: 'RUR',
      schedule: 'remote',
      experience: '3-6',
    })
  })

  it('разбирает вакансию без зарплаты и без метки формата', async () => {
    const cards = parseSerpPage(await read('nuxt-label'))
    const card = cards.find((item) => item.hhId === '138832343')

    expect(card?.salaryFrom).toBeNull()
    expect(card?.salaryTo).toBeNull()
    expect(card?.currency).toBeNull()
    expect(card?.schedule).toBeNull()
    expect(card?.experience).toBe('6+')
    expect(card?.company).toBe('АстраЗенека')
  })

  it('разбирает вилку «от – до»', async () => {
    const cards = parseSerpPage(await read('vue-role'))
    const card = cards.find((item) => item.hhId === '138399509')

    expect(cards).toHaveLength(5)
    expect(card?.salaryFrom).toBe(250000)
    expect(card?.salaryTo).toBe(350000)
    expect(card?.currency).toBe('RUR')
    expect(card?.schedule).toBe('remote')
  })

  it('читает работодателя: ссылку, отзывы, бейджи и логотип', async () => {
    const cards = parseSerpPage(await read('ts-fullstack'))
    const card = cards.find((item) => item.hhId === '138758029')

    expect(card?.employerUrl).toBe('https://hh.ru/employer/2343')
    expect(card?.employerTrusted).toBe(true)
    expect(card?.employerRating).toBe('4.2')
    expect(card?.employerReviews).toBe('10718 отзывов')
    expect(card?.employerHhRating).toBe(true)
    expect(card?.employerHrBrand).toBe(true)
    expect(card?.employerLogo).toBe('https://img.hhcdn.ru/employer-logo/7823407.png')
  })

  it('не придумывает зарплату, если её нет в карточке', async () => {
    const cards = parseSerpPage(await read('ts-fullstack'))
    const withoutSalary = cards.filter((card) => card.salaryFrom === null && card.salaryTo === null)

    expect(cards).toHaveLength(5)
    expect(withoutSalary.length).toBeGreaterThan(0)
    expect(cards.every((card) => card.currency === null || card.salaryFrom !== null)).toBe(true)
  })

  it('схлопывает дубли по hhId в пределах страницы', async () => {
    const html = await read('nuxt-label')
    const doubled = `${html}${html}`
    const cards = parseSerpPage(doubled)

    expect(cards).toHaveLength(3)
    expect(new Set(cards.map((card) => card.hhId)).size).toBe(3)
  })

  it('на чужой разметке возвращает пустой список, а не мусор', () => {
    expect(parseSerpPage('<html><body><p>Ничего нет</p></body></html>')).toEqual([])
    expect(parseSerpPage('')).toEqual([])
  })

  it('фикстуры не содержат почты, телефона и скриптов', async () => {
    for (const name of ['nuxt-label', 'vue-role', 'ts-fullstack']) {
      const html = await read(name)

      expect(html).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
      expect(html).not.toMatch(/\+7\s?\(?\d{3}/)
      expect(html).not.toMatch(/<script/i)
    }
  })
})
