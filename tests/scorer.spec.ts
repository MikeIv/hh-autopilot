import { describe, expect, it } from 'vitest'
import {
  SCORING_WEIGHTS,
  candidateExperienceYears,
  scoreVacancy,
  techTerms,
} from '../shared/utils/scorer'
import { loadPortrait } from '../server/utils/portrait'
import type { ScorableVacancy } from '../shared/types/score'

/** Вакансия мечты: стек, роль, формат, опыт и деньги портрета совпадают. */
const IDEAL: ScorableVacancy = {
  title: 'Senior Fullstack-разработчик (Nuxt 4, Vue 3, TypeScript)',
  description:
    'Продуктовый сервис: бронирование, оплата, личные кабинеты. Nuxt и Nitro, тесты и аккуратный UI.',
  salaryFrom: 250000,
  salaryTo: 300000,
  currency: 'RUR',
  schedule: 'remote',
  employment: null,
  experience: '6+',
}

/** Вакансия мимо: другой стек, нет вилки и формата. */
const ALIEN: ScorableVacancy = {
  title: 'Java-разработчик (Spring Boot)',
  description: null,
  salaryFrom: null,
  salaryTo: null,
  currency: null,
  schedule: null,
  employment: null,
  experience: '3-6',
}

const criterion = (result: Awaited<ReturnType<typeof scoreVacancy>>, key: string) =>
  result.criteria.find((item) => item.key === key)

describe('скоринг вакансии', () => {
  it('оценивает идеальную вакансию в сто баллов', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, IDEAL)

    expect(result.total).toBe(100)
    expect(result.passed).toBe(true)
    expect(result.threshold).toBe(65)
  })

  it('держит веса критериев и сумму вкладов равной итогу', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, IDEAL)
    const weights = Object.values(SCORING_WEIGHTS).reduce((sum, weight) => sum + weight, 0)

    expect(weights).toBe(100)
    expect(result.total).toBe(result.criteria.reduce((sum, item) => sum + item.earned, 0))
    expect(result.criteria.map((item) => item.key)).toEqual([
      'stack',
      'role',
      'format',
      'experience',
      'salary',
    ])
  })

  it('объясняет каждый критерий человеческой причиной', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, IDEAL)

    expect(criterion(result, 'stack')?.reason).toContain('nuxt')
    expect(criterion(result, 'role')?.reason).toContain('профилем')
    expect(criterion(result, 'role')?.reason).toContain('(fullstack)')
    expect(criterion(result, 'format')?.reason).toContain('remote')
    expect(criterion(result, 'experience')?.reason).toContain('нужно от 6 лет')
    expect(criterion(result, 'salary')?.reason).toContain('300000')
  })

  it('режет баллы чужому стеку и не считает неизвестное провалом', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, ALIEN)

    expect(criterion(result, 'stack')?.earned).toBe(0)
    expect(criterion(result, 'format')?.earned).toBe(8)
    expect(criterion(result, 'salary')?.earned).toBe(5)
    expect(criterion(result, 'salary')?.reason).toContain('не указана')
    expect(criterion(result, 'experience')?.earned).toBe(15)
    expect(result.passed).toBe(false)
  })

  it('считает вилку ниже пожелания пропорционально', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, {
      ...IDEAL,
      salaryFrom: 120000,
      salaryTo: 150000,
    })

    expect(criterion(result, 'salary')?.earned).toBe(7)
    expect(criterion(result, 'salary')?.reason).toContain('150000')
  })

  it('переключает прохождение порога настройкой', async () => {
    const portrait = await loadPortrait()
    const strict = scoreVacancy(portrait, ALIEN, 40)
    const soft = scoreVacancy(portrait, ALIEN, 30)

    expect(strict.total).toBe(soft.total)
    expect(strict.passed).toBe(false)
    expect(soft.passed).toBe(true)
  })

  it('без описания не проверяет домен и говорит об этом', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, { ...IDEAL, description: null })

    expect(criterion(result, 'role')?.reason).toContain('домен не проверен')
    expect(criterion(result, 'role')?.earned).toBe(15)
  })

  it('помечает неизвестный требуемый опыт половиной веса', async () => {
    const portrait = await loadPortrait()
    const result = scoreVacancy(portrait, { ...IDEAL, experience: null })

    expect(criterion(result, 'experience')?.earned).toBe(8)
    expect(criterion(result, 'experience')?.reason).toContain('не указан')
  })
})

describe('стаж и технологии портрета', () => {
  it('считает стаж от начала веб-опыта, а не от последнего места', async () => {
    const portrait = await loadPortrait()
    const years = candidateExperienceYears(portrait, new Date(2026, 9, 31))

    expect(years).toBe(9)
  })

  it('нормализует технологии ключевых навыков без версий и пояснений', async () => {
    const portrait = await loadPortrait()
    const terms = techTerms(portrait)

    expect(terms).toContain('nuxt')
    expect(terms).toContain('vue')
    expect(terms).toContain('typescript')
    expect(terms).not.toContain('nuxt 4')
    expect(new Set(terms).size).toBe(terms.length)
  })
})
