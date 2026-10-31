import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApplicationStatus } from '../shared/types/domain'

/**
 * Проверяет схему как её увидит инструмент: миграции накатываются одной командой,
 * hhId уникален, связанные записи удаляются вместе с вакансией.
 * Путь считается от prisma/schema.prisma — так его понимают и CLI, и клиент.
 */
const DB_FILE = join(process.cwd(), 'data', `test-${process.pid}.db`)
const DB_URL = `file:../data/test-${process.pid}.db`

/** CLI Prisma запускается тем же Node, без shell: так работает и на Windows. */
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')

const vacancyData = {
  hhId: '100000001',
  title: 'Nuxt fullstack разработчик',
  company: 'Тестовая компания',
  url: 'https://hh.ru/vacancy/100000001',
  source: 'nuxt fullstack',
}

let prisma: PrismaClient

beforeAll(() => {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  })

  prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })
})

afterAll(async () => {
  await prisma.$disconnect()
  await rm(DB_FILE, { force: true })
  await rm(`${DB_FILE}-journal`, { force: true })
})

describe('схема базы', () => {
  it('накатывается миграциями и сохраняет вакансию', async () => {
    const vacancy = await prisma.vacancy.create({ data: vacancyData })

    expect(vacancy.id).toBeTruthy()
    expect(vacancy.collectedAt).toBeInstanceOf(Date)
    expect(await prisma.vacancy.count()).toBe(1)
  })

  it('не даёт завести вакансию дважды: hhId уникален', async () => {
    await expect(prisma.vacancy.create({ data: vacancyData })).rejects.toThrow(/hhId/)
  })

  it('удаляет оценку, письмо и отклик вместе с вакансией', async () => {
    const vacancy = await prisma.vacancy.create({
      data: { ...vacancyData, hhId: '100000002', url: 'https://hh.ru/vacancy/100000002' },
    })

    await prisma.score.create({
      data: {
        vacancyId: vacancy.id,
        total: 72,
        threshold: 65,
        passed: true,
        criteria: '[]',
      },
    })

    const letter = await prisma.letter.create({
      data: {
        vacancyId: vacancy.id,
        variant: 'product',
        body: 'Здравствуйте!',
        charCount: 13,
      },
    })

    await prisma.application.create({
      data: { vacancyId: vacancy.id, letterId: letter.id },
    })

    await prisma.vacancy.delete({ where: { id: vacancy.id } })

    expect(await prisma.score.count()).toBe(0)
    expect(await prisma.letter.count()).toBe(0)
    expect(await prisma.application.count()).toBe(0)
  })

  it('ставит отклику статус очереди по умолчанию', async () => {
    const vacancy = await prisma.vacancy.create({
      data: { ...vacancyData, hhId: '100000003', url: 'https://hh.ru/vacancy/100000003' },
    })

    const application = await prisma.application.create({ data: { vacancyId: vacancy.id } })
    const status: ApplicationStatus = application.status as ApplicationStatus

    expect(status).toBe('queued')
  })

  it('хранит настройки по ключу и журнал действий', async () => {
    await prisma.setting.create({ data: { key: 'score.threshold', value: '65' } })
    const setting = await prisma.setting.update({
      where: { key: 'score.threshold' },
      data: { value: '70' },
    })

    const run = await prisma.run.create({ data: { kind: 'collect' } })
    const log = await prisma.actionLog.create({
      data: { kind: 'collect', message: 'Собрано 12 вакансий', runId: run.id },
    })

    expect(setting.value).toBe('70')
    expect(run.status).toBe('running')
    expect(log.level).toBe('info')
    expect(await prisma.actionLog.count()).toBe(1)
  })
})
