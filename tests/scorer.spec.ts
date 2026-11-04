import { describe, expect, it } from 'vitest'
import {
  SCORING_WEIGHTS,
  candidateExperienceYears,
  compareNuxtStackFirst,
  matchedTech,
  nuxtStackLabels,
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

    expect(criterion(result, 'stack')?.reason).toContain('стека Nuxt')
    expect(criterion(result, 'stack')?.matches?.[0]).toBe('Nuxt')
    expect(criterion(result, 'role')?.reason).toContain('профилем')
    expect(criterion(result, 'role')?.reason).toContain('(frontend, fullstack)')
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

  it('ставит стек Nuxt раньше остальных совпадений и выше в выдаче', async () => {
    const portrait = await loadPortrait()
    const reordered = {
      ...portrait,
      hh: {
        ...portrait.hh,
        keywords: ['Git', 'Docker', 'HTML', 'Nuxt', 'Vue', 'TypeScript', 'Nitro'],
      },
    }
    const text = 'Нужен Git, Docker и HTML, а также Nuxt и Vue'
    const matched = matchedTech(reordered, text)

    expect(matched.slice(0, 2)).toEqual(['Nuxt', 'Vue'])
    expect(matched.indexOf('Nuxt')).toBeLessThan(matched.indexOf('Git'))
    expect(
      matchedTech(
        { ...reordered, hh: { ...reordered.hh, keywords: ['Vue', 'Git', 'Nuxt'] } },
        'Vue, Git и Nuxt',
      ).slice(0, 2),
    ).toEqual(['Nuxt', 'Vue'])

    const withNuxt = scoreVacancy(reordered, {
      ...ALIEN,
      title: 'Nuxt разработчик',
      description: text,
    })
    const withoutNuxt = scoreVacancy(reordered, {
      ...ALIEN,
      title: 'Инженер сопровождения',
      description: 'Git, Docker и HTML',
    })

    const ranked = (result: ReturnType<typeof scoreVacancy>) => ({
      total: result.total,
      nuxtStack: nuxtStackLabels(result.criteria),
    })

    expect(compareNuxtStackFirst(ranked(withNuxt), ranked(withoutNuxt))).toBeLessThan(0)
    expect(
      compareNuxtStackFirst({ total: 60, nuxtStack: ['Nuxt'] }, { total: 90, nuxtStack: ['Vue'] }),
    ).toBeLessThan(0)
    expect(
      compareNuxtStackFirst(
        { total: 70, nuxtStack: ['Vue'] },
        { total: 95, nuxtStack: ['TypeScript'] },
      ),
    ).toBeLessThan(0)
    expect(
      nuxtStackLabels([
        {
          key: 'stack',
          weight: 35,
          earned: 12,
          reason: 'совпали технологии стека Nuxt: Vue (1 из 3 для полного балла)',
        },
      ]),
    ).toEqual(['Vue'])
    expect(
      nuxtStackLabels([
        {
          key: 'stack',
          weight: 35,
          earned: 18,
          reason: 'совпали технологии портрета, без стека Nuxt: Git, Docker',
        },
      ]),
    ).toEqual([])
    expect(withNuxt.criteria.find((item) => item.key === 'stack')?.matches?.slice(0, 2)).toEqual([
      'Nuxt',
      'Vue',
    ])
  })
})
