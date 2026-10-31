import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTempDatabase } from './temp-db'
import { HhBlockedError } from '../server/utils/hh-session'
import {
  ApplyError,
  PANIC_SETTING_KEY,
  assertReadyToSend,
  clearPanic,
  countSentToday,
  raisePanic,
  readPanicAt,
  readApplyStatus,
  runApply,
  sendApprovedNow,
} from '../server/services/apply'
import type { ApplyDeps } from '../server/services/apply'
import type { SendResult } from '../shared/types/apply'
import { formatMskTime, isApplyWindowOpen, nextDelayMs, startOfMskDay } from '../shared/utils/apply'
import { parseApplyPage } from '../shared/utils/apply-page'
import { DAILY_APPLICATION_LIMIT } from '../shared/types/queue'

/** Понедельник, 12:00 МСК: окно открыто, все тесты идут на подставных часах. */
const NOW = new Date('2026-10-05T09:00:00Z')

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/apply/${name}`, import.meta.url), 'utf8')

/** Зависимости прогона: часы, rng и пауза подменяются, браузер — заглушкой. */
function deps(client: PrismaClient, overrides: Partial<ApplyDeps> = {}): ApplyDeps {
  return {
    client,
    now: () => NOW,
    rng: () => 0,
    sleep: async () => undefined,
    sender: async (): Promise<SendResult> => ({ applied: true, alreadyApplied: false }),
    ...overrides,
  }
}

interface ApprovedOptions {
  title?: string
  status?: string
  withLetter?: boolean
  approvedAt?: Date
  sentAt?: Date | null
}

/** Одобренный отклик с письмом: то, что прогон забирает в работу. */
async function createApplication(
  client: PrismaClient,
  hhId: string,
  options: ApprovedOptions = {},
) {
  const vacancy = await client.vacancy.create({
    data: {
      hhId,
      title: options.title ?? `Вакансия ${hhId}`,
      company: 'Компания',
      url: `https://hh.ru/vacancy/${hhId}`,
      source: 'тест',
    },
  })

  const letter =
    options.withLetter === false
      ? null
      : await client.letter.create({
          data: {
            vacancyId: vacancy.id,
            variant: 'product',
            body: `Здравствуйте! Письмо ${hhId}`,
            charCount: 26,
          },
        })

  const application = await client.application.create({
    data: {
      vacancyId: vacancy.id,
      letterId: letter?.id ?? null,
      status: options.status ?? 'approved',
      approvedAt: options.approvedAt ?? NOW,
      sentAt: options.sentAt ?? null,
    },
  })

  return { vacancy, letter, application }
}

describe('правила отправки', () => {
  it('окно 10:00–19:00 по Москве, только будни', () => {
    expect(isApplyWindowOpen(new Date('2026-10-05T06:59:00Z'))).toBe(false)
    expect(isApplyWindowOpen(new Date('2026-10-05T07:00:00Z'))).toBe(true)
    expect(isApplyWindowOpen(new Date('2026-10-05T15:59:00Z'))).toBe(true)
    expect(isApplyWindowOpen(new Date('2026-10-05T16:00:00Z'))).toBe(false)
    expect(isApplyWindowOpen(new Date('2026-10-03T10:00:00Z'))).toBe(false)
    expect(isApplyWindowOpen(new Date('2026-10-04T10:00:00Z'))).toBe(false)
  })

  it('задержка между откликами — 45–150 секунд', () => {
    expect(nextDelayMs(() => 0)).toBe(45_000)
    expect(nextDelayMs(() => 1)).toBe(150_000)
    expect(nextDelayMs(() => 0.5)).toBe(97_500)

    for (let index = 0; index < 200; index += 1) {
      const delay = nextDelayMs(() => index / 200)
      expect(delay).toBeGreaterThanOrEqual(45_000)
      expect(delay).toBeLessThanOrEqual(150_000)
    }
  })

  it('считает московские сутки и время для сообщений', () => {
    expect(startOfMskDay(NOW).toISOString()).toBe('2026-10-04T21:00:00.000Z')
    expect(formatMskTime(NOW)).toBe('12:00 МСК')
    expect(formatMskTime(new Date('2026-10-05T16:30:00Z'))).toBe('19:30 МСК')
  })
})

describe('разбор страницы отклика', () => {
  it('видит кнопку отклика на странице вакансии', () => {
    const state = parseApplyPage(fixture('vacancy.html'))

    expect(state.hasApplyButton).toBe(true)
    expect(state.alreadyApplied).toBe(false)
  })

  it('видит поле письма и кнопку отправки в форме', () => {
    const state = parseApplyPage(fixture('vacancy-form.html'))

    expect(state.hasLetterField).toBe(true)
    expect(state.hasSubmitButton).toBe(true)
    expect(state.alreadyApplied).toBe(false)
  })

  it('понимает, что отклик уже отправлен', () => {
    const state = parseApplyPage(
      '<div data-qa="vacancy-response-already-applied">Отклик отправлен</div>',
    )

    expect(state.hasApplyButton).toBe(false)
    expect(state.alreadyApplied).toBe(true)
    expect(state.successText).toContain('Отклик отправлен')
  })

  it('не считает отправленным пустую страницу без кнопки отклика', () => {
    expect(parseApplyPage('<div>Вакансия закрыта</div>').alreadyApplied).toBe(false)
  })
})

describe('прогон отправки', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('apply')
    prisma = db.client
    close = db.close
  })

  beforeEach(async () => {
    await prisma.actionLog.deleteMany()
    await prisma.run.deleteMany()
    await prisma.application.deleteMany()
    await prisma.letter.deleteMany()
    await prisma.vacancy.deleteMany()
    await prisma.setting.deleteMany()
  })

  afterAll(async () => {
    await close()
  })

  it('без HH_AUTO_APPLY только печатает план и не трогает статусы', async () => {
    const first = await createApplication(prisma, '600000001', { title: 'Первая' })
    const second = await createApplication(prisma, '600000002', { title: 'Вторая' })
    const calls: string[] = []

    const result = await runApply({
      autoApplyEnabled: false,
      deps: deps(prisma, {
        sender: async (target) => {
          calls.push(target.title)
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(result.mode).toBe('dry')
    expect(result.sent).toBe(0)
    expect(result.planned.map((target) => target.title)).toEqual(['Первая', 'Вторая'])
    expect(calls).toEqual([])
    expect(result.message).toContain('HH_AUTO_APPLY выключен')

    const statuses = await prisma.application.findMany({ select: { status: true } })
    expect(statuses.map((row) => row.status)).toEqual(['approved', 'approved'])
    expect(first.vacancy.id).not.toBe(second.vacancy.id)
  })

  it('отправляет одобренные по порядку, ставит sent и делает паузу 45–150 с', async () => {
    await createApplication(prisma, '600000010', {
      title: 'Старая',
      approvedAt: new Date('2026-10-05T08:00:00Z'),
    })
    await createApplication(prisma, '600000011', {
      title: 'Новая',
      approvedAt: new Date('2026-10-05T08:30:00Z'),
    })
    await createApplication(prisma, '600000012', { title: 'Отклонённая', status: 'rejected' })
    await createApplication(prisma, '600000013', { title: 'Без письма', withLetter: false })

    const calls: string[] = []
    const sleeps: number[] = []

    const result = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async (target) => {
          calls.push(target.title)
          return { applied: true, alreadyApplied: false }
        },
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      }),
    })

    expect(result.mode).toBe('live')
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.stopped).toBe('none')
    expect(calls).toEqual(['Старая', 'Новая'])

    const pause = sleeps.reduce((sum, ms) => sum + ms, 0)
    expect(pause).toBeGreaterThanOrEqual(45_000)
    expect(pause).toBeLessThanOrEqual(150_000)

    const sent = await prisma.application.findMany({
      where: { status: 'sent' },
      include: { vacancy: { select: { title: true } } },
      orderBy: { sentAt: 'asc' },
    })
    expect(sent.map((row) => row.vacancy.title)).toEqual(['Старая', 'Новая'])
    expect(sent.every((row) => row.sentAt instanceof Date)).toBe(true)
    expect(await countSentToday(prisma, NOW)).toBe(2)
    expect(await prisma.actionLog.count({ where: { kind: 'apply', level: 'info' } })).toBe(2)

    const run = await prisma.run.findFirstOrThrow({ where: { kind: 'apply' } })
    expect(run.status).toBe('done')
    expect(run.note).toContain('Отправлено: 2')
  })

  it('не отправляет сверх дневного лимита и сверх --limit', async () => {
    for (let index = 0; index < DAILY_APPLICATION_LIMIT; index += 1) {
      await createApplication(prisma, `6000001${index}`, {
        status: 'sent',
        sentAt: NOW,
        withLetter: false,
      })
    }
    await createApplication(prisma, '600000200', { title: 'Лишняя' })

    const calls: string[] = []
    const full = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async (target) => {
          calls.push(target.title)
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(full.stopped).toBe('limit')
    expect(full.sent).toBe(0)
    expect(calls).toEqual([])

    await prisma.application.deleteMany({ where: { status: 'sent' } })
    await createApplication(prisma, '600000201', { title: 'Вторая' })

    const limited = await runApply({
      autoApplyEnabled: true,
      limit: 1,
      deps: deps(prisma, {
        sender: async (target) => {
          calls.push(target.title)
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(limited.sent).toBe(1)
    expect(limited.stopped).toBe('limit')
    expect(calls).toEqual(['Лишняя'])
    expect(await prisma.application.count({ where: { status: 'approved' } })).toBe(1)
  })

  it('капча останавливает прогон, помечает needs_human и не трогает следующую', async () => {
    const first = await createApplication(prisma, '600000300', {
      title: 'Первая',
      approvedAt: new Date('2026-10-05T08:00:00Z'),
    })
    const second = await createApplication(prisma, '600000301', {
      title: 'Вторая',
      approvedAt: new Date('2026-10-05T08:30:00Z'),
    })
    let calls = 0

    const result = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async () => {
          calls += 1
          throw new HhBlockedError('captcha', 'hh просит подтвердить, что действие делает человек')
        },
      }),
    })

    expect(result.stopped).toBe('blocked')
    expect(result.sent).toBe(0)
    expect(calls).toBe(1)

    const stopped = await prisma.application.findUniqueOrThrow({
      where: { id: first.application.id },
    })
    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: second.application.id },
    })
    expect(stopped.status).toBe('needs_human')
    expect(untouched.status).toBe('approved')

    const run = await prisma.run.findFirstOrThrow({ where: { kind: 'apply' } })
    expect(run.status).toBe('needs_human')
  })

  it('повторный прогон не отправляет тот же отклик дважды', async () => {
    await createApplication(prisma, '600000400', { title: 'Одна' })
    let calls = 0

    const sendDeps = deps(prisma, {
      sender: async () => {
        calls += 1
        return { applied: true, alreadyApplied: false }
      },
    })

    expect((await runApply({ autoApplyEnabled: true, deps: sendDeps })).sent).toBe(1)
    const second = await runApply({ autoApplyEnabled: true, deps: sendDeps })

    expect(second.sent).toBe(0)
    expect(calls).toBe(1)
    expect(await prisma.application.count({ where: { status: 'sent' } })).toBe(1)
  })

  it('panic до прогона и во время паузы останавливает отправку', async () => {
    await createApplication(prisma, '600000500', { title: 'До panic' })

    await raisePanic(prisma, NOW)
    let calls = 0
    const blocked = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async () => {
          calls += 1
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(blocked.stopped).toBe('panic')
    expect(blocked.sent).toBe(0)
    expect(calls).toBe(0)
    expect(await readPanicAt(prisma)).toBeInstanceOf(Date)

    await clearPanic(prisma)
    await prisma.application.deleteMany()
    await createApplication(prisma, '600000501', { title: 'Первая' })
    await createApplication(prisma, '600000502', { title: 'Вторая' })

    let sent = 0
    const during = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async () => {
          sent += 1
          await raisePanic(prisma, NOW)
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(during.stopped).toBe('panic')
    expect(during.sent).toBe(1)
    expect(sent).toBe(1)
    expect(await prisma.application.count({ where: { status: 'approved' } })).toBe(1)
  })

  it('окно закрыто — прогон не начинается', async () => {
    await createApplication(prisma, '600000600', { title: 'Вечерняя' })
    let calls = 0

    const result = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        now: () => new Date('2026-10-05T17:00:00Z'),
        sender: async () => {
          calls += 1
          return { applied: true, alreadyApplied: false }
        },
      }),
    })

    expect(result.stopped).toBe('window')
    expect(result.sent).toBe(0)
    expect(calls).toBe(0)
    expect(result.message).toContain('окно')
  })

  it('отклик, уже отправленный на hh, отмечается как отправленный', async () => {
    await createApplication(prisma, '600000700', { title: 'Уже было' })

    const result = await runApply({
      autoApplyEnabled: true,
      deps: deps(prisma, {
        sender: async (): Promise<SendResult> => ({ applied: false, alreadyApplied: true }),
      }),
    })

    expect(result.sent).toBe(1)
    expect(await prisma.application.count({ where: { status: 'sent' } })).toBe(1)
    expect(await prisma.actionLog.count({ where: { level: 'warn' } })).toBe(1)
  })

  it('второй прогон при живом первом не стартует', async () => {
    await createApplication(prisma, '600000800', { title: 'Одна' })
    await prisma.run.create({
      data: { kind: 'apply', status: 'running', startedAt: NOW, note: 'живой прогон' },
    })

    await expect(runApply({ autoApplyEnabled: true, deps: deps(prisma) })).rejects.toThrow(
      'Прогон уже идёт',
    )
  })
})

describe('ручная отправка одной карточки', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('apply-manual')
    prisma = db.client
    close = db.close
  })

  beforeEach(async () => {
    await prisma.actionLog.deleteMany()
    await prisma.run.deleteMany()
    await prisma.application.deleteMany()
    await prisma.letter.deleteMany()
    await prisma.vacancy.deleteMany()
    await prisma.setting.deleteMany()
  })

  afterAll(async () => {
    await close()
  })

  it('отправляет одобренную карточку и пишет журнал', async () => {
    const { application } = await createApplication(prisma, '700000001', { title: 'Ручная' })

    const result = await sendApprovedNow(application.vacancyId, deps(prisma))

    expect(result.status).toBe('sent')
    expect(await prisma.application.count({ where: { status: 'sent' } })).toBe(1)
    expect(await prisma.actionLog.count({ where: { kind: 'apply' } })).toBe(1)

    await expect(sendApprovedNow(application.vacancyId, deps(prisma))).rejects.toBeInstanceOf(
      ApplyError,
    )
  })

  it('не отправляет неодобренное, вне окна, при panic и при исчерпанном лимите', async () => {
    const queued = await createApplication(prisma, '700000010', {
      status: 'queued',
      withLetter: true,
    })
    await expect(sendApprovedNow(queued.application.vacancyId, deps(prisma))).rejects.toThrow(
      'только одобренный',
    )

    const approved = await createApplication(prisma, '700000011', { title: 'Одобренная' })
    const evening = deps(prisma, { now: () => new Date('2026-10-05T17:00:00Z') })
    await expect(sendApprovedNow(approved.application.vacancyId, evening)).rejects.toThrow('Окно')

    await raisePanic(prisma, NOW)
    await expect(sendApprovedNow(approved.application.vacancyId, deps(prisma))).rejects.toThrow(
      'Остановка',
    )
    await clearPanic(prisma)

    for (let index = 0; index < DAILY_APPLICATION_LIMIT; index += 1) {
      await createApplication(prisma, `7000001${index}`, {
        status: 'sent',
        sentAt: NOW,
        withLetter: false,
      })
    }
    await expect(sendApprovedNow(approved.application.vacancyId, deps(prisma))).rejects.toThrow(
      'Дневной лимит',
    )
  })

  it('не стартует, пока идёт прогон', async () => {
    const { application } = await createApplication(prisma, '700000020', { title: 'Ждёт' })
    await prisma.run.create({
      data: { kind: 'apply', status: 'running', startedAt: NOW, note: 'живой прогон' },
    })

    await expect(sendApprovedNow(application.vacancyId, deps(prisma))).rejects.toThrow(
      'Прогон уже идёт',
    )
  })

  it('капча переводит карточку в needs_human и возвращает ошибку', async () => {
    const { application } = await createApplication(prisma, '700000030', { title: 'Капча' })

    const captchaDeps = deps(prisma, {
      sender: async () => {
        throw new HhBlockedError('login', 'Сессия hh истекла')
      },
    })

    await expect(sendApprovedNow(application.vacancyId, captchaDeps)).rejects.toThrow(
      'Сессия hh истекла',
    )

    const saved = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(saved.status).toBe('needs_human')
    const run = await prisma.run.findFirstOrThrow({ where: { kind: 'apply' } })
    expect(run.status).toBe('needs_human')
  })

  it('без письма не отправляет', async () => {
    const { application } = await createApplication(prisma, '700000040', {
      title: 'Без письма',
      withLetter: false,
    })

    await expect(sendApprovedNow(application.vacancyId, deps(prisma))).rejects.toThrow('Письмо')
  })
})

describe('состояние отправки', () => {
  let prisma: PrismaClient
  let close: () => Promise<void>

  beforeAll(async () => {
    const db = await openTempDatabase('apply-status')
    prisma = db.client
    close = db.close
  })

  beforeEach(async () => {
    await prisma.actionLog.deleteMany()
    await prisma.run.deleteMany()
    await prisma.application.deleteMany()
    await prisma.letter.deleteMany()
    await prisma.vacancy.deleteMany()
    await prisma.setting.deleteMany()
  })

  afterAll(async () => {
    await close()
  })

  it('отдаёт окно, лимит, panic и последний прогон', async () => {
    await createApplication(prisma, '800000001', { status: 'sent', sentAt: NOW })
    await prisma.run.create({
      data: {
        kind: 'apply',
        status: 'done',
        finishedAt: NOW,
        note: 'Отправлено: 1',
        startedAt: NOW,
      },
    })

    const status = await readApplyStatus(prisma, NOW)

    expect(status.windowOpen).toBe(true)
    expect(status.sentToday).toBe(1)
    expect(status.dailyLimit).toBe(DAILY_APPLICATION_LIMIT)
    expect(status.active).toBe(false)
    expect(status.panicAt).toBeNull()
    expect(status.lastRun?.message).toBe('Отправлено: 1')
  })

  it('показывает активный прогон и поднятый panic', async () => {
    const panicAt = await raisePanic(prisma, NOW)
    await prisma.run.create({
      data: { kind: 'apply', status: 'running', startedAt: NOW, note: 'живой прогон' },
    })

    const status = await readApplyStatus(prisma, NOW)

    expect(status.active).toBe(true)
    expect(status.panicAt).toBe(panicAt.toISOString())
    await expect(assertReadyToSend(prisma, NOW)).rejects.toThrow('Остановка')
  })

  it('снимает зависший прогон и не держит замок', async () => {
    await prisma.run.create({
      data: {
        kind: 'apply',
        status: 'running',
        startedAt: new Date('2026-10-05T07:00:00Z'),
        note: 'старый',
      },
    })
    await prisma.setting.create({ data: { key: PANIC_SETTING_KEY, value: 'мусор' } })

    const status = await readApplyStatus(prisma, NOW)

    expect(status.active).toBe(false)
    expect(status.panicAt).toBeNull()
    const stale = await prisma.run.findFirstOrThrow({ where: { kind: 'apply' } })
    expect(stale.status).toBe('failed')
  })
})
