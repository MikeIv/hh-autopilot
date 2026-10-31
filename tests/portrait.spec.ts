import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RESUME_PATH, loadPortrait, resolveResumePath } from '../server/utils/portrait'
import { parsePortrait } from '../shared/utils/portrait'

/** Реальное `resume.yaml` соседнего пакета: портрет проверяется на живых данных. */
const REAL_RESUME = join(process.cwd(), '..', 'resume-site', 'data', 'resume.yaml')

/** Минимальный портрет для подмены пути: те же блоки, но свои значения. */
const MINIMAL_PORTRAIT = `basics:
  label: Nuxt fullstack разработчик
  summary: Тестовый кандидат для схемы портрета.
  location: { city: Москва, countryCode: RU }
  formats: [remote]
  salary: { amount: 225000, currency: RUR, period: month }
experience:
  - company: Тестовая компания
    position: Программист
    from: 2020-01
    to: null
    summary: Тестовый опыт работы.
    achievements: [Сделал тестовую задачу]
    stack: [Nuxt]
skills:
  - group: Стек
    items: [Nuxt, TypeScript]
hh:
  portrait:
    domain: Продуктовый веб
    product: Nuxt и Nitro
    team: Команда с тимлидом
    process: CI и тесты
  keywords: [Nuxt, TypeScript]
`

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hh-portrait-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('путь к портрету', () => {
  it('по умолчанию — соседний пакет resume-site', () => {
    expect(DEFAULT_RESUME_PATH).toBe(REAL_RESUME)
    expect(resolveResumePath('')).toBe(REAL_RESUME)
  })

  it('относительный путь из RESUME_PATH считается от корня проекта', () => {
    expect(resolveResumePath('../resume-site/data/resume.yaml')).toBe(DEFAULT_RESUME_PATH)
  })

  it('абсолютный путь из RESUME_PATH берётся как есть', () => {
    expect(resolveResumePath(REAL_RESUME)).toBe(REAL_RESUME)
  })
})

describe('портрет из реального resume.yaml', () => {
  it('читается и проходит схему', async () => {
    vi.stubEnv('RESUME_PATH', REAL_RESUME)
    const portrait = await loadPortrait()

    expect(portrait.basics.label).toContain('Nuxt')
    expect(portrait.basics.formats).toContain('remote')
    expect(portrait.basics.salary.amount).toBeGreaterThan(0)
    expect(portrait.basics.salary.currency).toBe('RUR')
    expect(portrait.experience.length).toBeGreaterThanOrEqual(3)
    expect(portrait.skills.length).toBeGreaterThanOrEqual(3)
    expect(portrait.hh.portrait.domain).toMatch(/Продуктовый/)
    expect(portrait.hh.keywords.length).toBeGreaterThanOrEqual(20)
    expect(portrait.hh.keywords.length).toBeLessThanOrEqual(30)
  })

  it('оставляет только блоки портрета: второй источник правды не заводим', async () => {
    vi.stubEnv('RESUME_PATH', REAL_RESUME)
    const portrait = await loadPortrait()

    expect(Object.keys(portrait).sort()).toEqual(['basics', 'experience', 'hh', 'skills'])
  })

  it('берёт путь из RESUME_PATH', async () => {
    const file = join(dir, 'resume.yaml')
    await writeFile(file, MINIMAL_PORTRAIT)
    vi.stubEnv('RESUME_PATH', file)

    const portrait = await loadPortrait()

    expect(portrait.basics.label).toBe('Nuxt fullstack разработчик')
    expect(portrait.hh.keywords).toEqual(['Nuxt', 'TypeScript'])
  })

  it('читает относительный путь из RESUME_PATH так же, как значение по умолчанию', async () => {
    vi.stubEnv('RESUME_PATH', '../resume-site/data/resume.yaml')

    const portrait = await loadPortrait()

    expect(portrait.basics.label).toContain('Nuxt')
  })

  it('сообщает путь, если файла нет', async () => {
    const file = join(dir, 'missing.yaml')
    vi.stubEnv('RESUME_PATH', file)

    await expect(loadPortrait()).rejects.toThrow(/Не удалось прочитать портрет/)
    await expect(loadPortrait()).rejects.toThrow('missing.yaml')
  })
})

describe('схема портрета', () => {
  it('отклоняет неизвестный формат занятости', async () => {
    const raw = await readFile(REAL_RESUME, 'utf8')
    const broken = raw.replace('formats: [remote, hybrid, office]', 'formats: [remote, planet]')

    expect(broken).not.toBe(raw)
    expect(() => parsePortrait(broken)).toThrow()
  })

  it('требует блок hh: без критериев и ключевых навыков искать нечем', () => {
    const broken = MINIMAL_PORTRAIT.replace(/hh:[\s\S]*$/, '')

    expect(() => parsePortrait(broken)).toThrow()
  })

  it('не пропускает больше 30 ключевых навыков', () => {
    const keywords = Array.from({ length: 31 }, (_, index) => `- Навык ${index + 1}`).join('\n')
    const broken = MINIMAL_PORTRAIT.replace(
      'keywords: [Nuxt, TypeScript]',
      `keywords:\n${keywords}`,
    )

    expect(broken).not.toBe(MINIMAL_PORTRAIT)
    expect(() => parsePortrait(broken)).toThrow()
  })

  it('отклоняет пустой опыт', () => {
    const broken = MINIMAL_PORTRAIT.replace(/experience:[\s\S]*?skills:/, 'experience: []\nskills:')

    expect(() => parsePortrait(broken)).toThrow()
  })
})
