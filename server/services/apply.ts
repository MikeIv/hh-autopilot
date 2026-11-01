import { setTimeout as sleep } from 'node:timers/promises'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import { HhBlockedError } from '../utils/hh-session'
import { DAILY_APPLICATION_LIMIT } from '../../shared/types/queue'
import type {
  ApplyMode,
  ApplyResult,
  ApplyRunSummary,
  ApplySkip,
  ApplyStatus,
  ApplyStopReason,
  ApplyTarget,
  ManualSendResponse,
  SendResult,
} from '../../shared/types/apply'
import type { LetterVariant, LogLevel, RunStatus } from '../../shared/types/domain'
import {
  formatMskTime,
  isApplyWindowOpen,
  nextDelayMs,
  startOfMskDay,
} from '../../shared/utils/apply'
import { sendApplication } from './hh-apply'
import { isRefreshRunning } from './refresh'

/** Ключ настройки-стопа: panic живёт в базе, чтобы CLI и сервер видели один флаг. */
export const PANIC_SETTING_KEY = 'apply.panic'

/** Прогон без обновления дольше получаса считается зависшим: он не должен держать замок. */
export const APPLY_RUN_STALE_MS = 30 * 60_000

/** Как часто прогон смотрит на panic во время паузы между откликами. */
const PANIC_CHECK_INTERVAL_MS = 2000

/** Ошибка отправки: обработчик API превращает её в статус ответа. */
export class ApplyError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'ApplyError'
    this.statusCode = statusCode
  }
}

/** Зависимости прогона: в тестах подменяются часы, rng, пауза и браузерный слой. */
export interface ApplyDeps {
  client: PrismaClient
  now: () => Date
  rng: () => number
  sleep: (ms: number) => Promise<void>
  sender: (target: ApplyTarget) => Promise<SendResult>
}

const defaultDeps: ApplyDeps = {
  client: prisma,
  now: () => new Date(),
  rng: Math.random,
  sleep: (ms) => sleep(ms),
  sender: sendApplication,
}

/** Кандидат на отправку: отклик, его письмо и адресная часть задания. */
interface ApplyCandidate extends ApplyTarget {
  applicationId: string
  letterId: string
}

export interface ApplyOptions {
  dryRun?: boolean
  limit?: number
  autoApplyEnabled?: boolean
  deps?: Partial<ApplyDeps>
}

/** Выключатель авто-отправки: по умолчанию выключен, включение — только вручную. */
export function isAutoApplyEnabled(): boolean {
  return process.env.HH_AUTO_APPLY === 'true'
}

/** Короткий текст ошибки: в лог и человеку, без стека и содержимого страницы. */
function shortError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** Время panic из настроек; мусор в значении считается «стопа нет». */
export async function readPanicAt(client: PrismaClient = prisma): Promise<Date | null> {
  const setting = await client.setting.findUnique({ where: { key: PANIC_SETTING_KEY } })
  if (!setting) {
    return null
  }
  const at = new Date(setting.value)
  return Number.isNaN(at.getTime()) ? null : at
}

/** Поднимает флаг остановки: текущий и следующий прогоны прекращают отправку. */
export async function raisePanic(client: PrismaClient = prisma, now = new Date()): Promise<Date> {
  const setting = await client.setting.upsert({
    where: { key: PANIC_SETTING_KEY },
    create: { key: PANIC_SETTING_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  })
  return new Date(setting.value)
}

/** Снимает флаг остановки: человек осознанно разрешает следующий прогон. */
export async function clearPanic(client: PrismaClient = prisma): Promise<void> {
  await client.setting.deleteMany({ where: { key: PANIC_SETTING_KEY } })
}

/** Сколько откликов уже ушло сегодня: граница — московские сутки. */
export async function countSentToday(
  client: PrismaClient = prisma,
  now = new Date(),
): Promise<number> {
  return client.application.count({
    where: { status: 'sent', sentAt: { gte: startOfMskDay(now) } },
  })
}

/** Активный прогон отправки; зависший снимается, чтобы не держать замок навсегда. */
async function findActiveRun(client: PrismaClient, now: Date): Promise<{ id: string } | null> {
  const active = await client.run.findFirst({
    where: { kind: 'apply', status: 'running' },
    orderBy: { startedAt: 'asc' },
  })

  if (!active) {
    return null
  }

  if (active.startedAt.getTime() < now.getTime() - APPLY_RUN_STALE_MS) {
    await client.run.update({
      where: { id: active.id },
      data: { status: 'failed', finishedAt: now, note: 'прогон прерван: процесс не ответил' },
    })
    await logAction(client, {
      level: 'warn',
      message: 'Снят зависший прогон отправки',
      runId: active.id,
    })
    return null
  }

  return { id: active.id }
}

/** Проверки перед живой отправкой: panic, окно, дневной лимит, занятый прогон. */
export async function assertReadyToSend(
  client: PrismaClient = prisma,
  now = new Date(),
): Promise<void> {
  const panicAt = await readPanicAt(client)
  if (panicAt) {
    throw new ApplyError(
      409,
      `Остановка активна с ${formatMskTime(panicAt)}: снимите флаг «Стоп», чтобы продолжить`,
    )
  }

  if (!isApplyWindowOpen(now)) {
    throw new ApplyError(
      409,
      `Окно отправки закрыто: будни 10:00–19:00 МСК, сейчас ${formatMskTime(now)}`,
    )
  }

  const sentToday = await countSentToday(client, now)
  if (sentToday >= DAILY_APPLICATION_LIMIT) {
    throw new ApplyError(
      409,
      `Дневной лимит откликов исчерпан: ${sentToday} из ${DAILY_APPLICATION_LIMIT}`,
    )
  }

  if (isRefreshRunning()) {
    throw new ApplyError(409, 'Сейчас обновляется выдача hh — дождитесь окончания')
  }

  const active = await findActiveRun(client, now)
  if (active) {
    throw new ApplyError(409, 'Прогон уже идёт — дождитесь завершения или нажмите «Стоп»')
  }
}

/** Почему прогон стоит — одна формулировка для человека и для лога. */
function describeStop(reason: ApplyStopReason, now: Date): string {
  switch (reason) {
    case 'panic':
      return 'остановлен: активен флаг panic'
    case 'window':
      return `остановлен: окно 10:00–19:00 МСК закрыто (${formatMskTime(now)})`
    case 'limit':
      return 'остановлен: лимит откликов исчерпан'
    case 'blocked':
      return 'остановлен: нужен человек — капча или истёкший вход на hh'
    case 'error':
      return 'остановлен: ошибка отправки'
    default:
      return ''
  }
}

/** Запись в журнал действий: без секретов и содержимого профиля сессии. */
async function logAction(
  client: PrismaClient,
  entry: { message: string; level?: LogLevel; meta?: unknown; runId?: string | null },
): Promise<void> {
  await client.actionLog.create({
    data: {
      kind: 'apply',
      level: entry.level ?? 'info',
      message: entry.message,
      meta: entry.meta === undefined ? null : JSON.stringify(entry.meta),
      runId: entry.runId ?? null,
    },
  })
}

/** Итог прогона в строку: счётчики и причина остановки. */
function liveMessage(result: ApplyResult, now: Date): string {
  const parts = [`Отправлено: ${result.sent}`]
  if (result.failed > 0) {
    parts.push(`ошибок: ${result.failed}`)
  }
  if (result.skipped > 0) {
    parts.push(`пропущено: ${result.skipped}`)
  }
  const stop = result.stopped === 'none' ? '' : ` · ${describeStop(result.stopped, now)}`
  return parts.join(' · ') + stop
}

/** Статистика прогона в `Run.stats`: JSON, как и остальные структурированные поля. */
function statsOf(result: ApplyResult): Record<string, unknown> {
  return {
    mode: result.mode,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    stopped: result.stopped,
    planned: result.planned.length,
  }
}

/** Завершает прогон: статус, время, статистика и заметка для человека. */
async function finishRun(
  client: PrismaClient,
  runId: string,
  status: RunStatus,
  note: string,
  now: Date,
  stats: Record<string, unknown>,
): Promise<void> {
  await client.run.update({
    where: { id: runId },
    data: { status, finishedAt: now, note, stats: JSON.stringify(stats) },
  })
}

/** Одобренные отклики с письмами; отклики без письма попадают в пропуски. */
async function loadCandidates(
  client: PrismaClient,
): Promise<{ candidates: ApplyCandidate[]; skips: ApplySkip[] }> {
  const applications = await client.application.findMany({
    where: { status: 'approved' },
    orderBy: [{ approvedAt: 'asc' }, { createdAt: 'asc' }],
    include: { letter: true, vacancy: { include: { letter: true } } },
  })

  const candidates: ApplyCandidate[] = []
  const skips: ApplySkip[] = []

  for (const application of applications) {
    const letter = application.letter ?? application.vacancy.letter
    if (!letter) {
      skips.push({
        vacancyId: application.vacancyId,
        title: application.vacancy.title,
        reason: 'no_letter',
        message: 'Письмо не собрано — прогони pnpm hh:letters',
      })
      continue
    }

    candidates.push({
      applicationId: application.id,
      letterId: letter.id,
      vacancyId: application.vacancyId,
      hhId: application.vacancy.hhId,
      title: application.vacancy.title,
      company: application.vacancy.company,
      url: application.vacancy.url,
      variant: letter.variant as LetterVariant,
      body: letter.body,
      charCount: letter.charCount,
    })
  }

  return { candidates, skips }
}

/** Пауза между откликами с проверкой panic: `false` — прогон должен остановиться. */
async function waitBetweenActions(deps: ApplyDeps): Promise<boolean> {
  let left = nextDelayMs(deps.rng)

  while (left > 0) {
    if (await readPanicAt(deps.client)) {
      return false
    }
    const chunk = Math.min(PANIC_CHECK_INTERVAL_MS, left)
    await deps.sleep(chunk)
    left -= chunk
  }

  return true
}

/** Отправляет одобренные отклики в окне и лимитах; сухой прогон ничего не нажимает. */
export async function runApply(options: ApplyOptions = {}): Promise<ApplyResult> {
  const deps: ApplyDeps = { ...defaultDeps, ...options.deps }
  const { client } = deps
  const now = deps.now()
  const autoApplyEnabled = options.autoApplyEnabled ?? isAutoApplyEnabled()
  const mode: ApplyMode = options.dryRun || !autoApplyEnabled ? 'dry' : 'live'
  const startedAt = now.toISOString()

  if (mode === 'live') {
    if (isRefreshRunning()) {
      throw new ApplyError(409, 'Сейчас обновляется выдача hh — дождитесь окончания')
    }

    const active = await findActiveRun(client, now)
    if (active) {
      throw new ApplyError(409, 'Прогон уже идёт — дождитесь завершения или нажмите «Стоп»')
    }
  }

  const run =
    mode === 'live'
      ? await client.run.create({
          data: { kind: 'apply', status: 'running', startedAt: now, note: 'живой прогон' },
        })
      : null

  if (run) {
    // Два процесса могли пройти проверку одновременно: второй прогон отменяется.
    const running = await client.run.count({ where: { kind: 'apply', status: 'running' } })
    if (running > 1) {
      await finishRun(
        client,
        run.id,
        'failed',
        'прогон отменён: параллельный запуск',
        deps.now(),
        {},
      )
      throw new ApplyError(409, 'Прогон уже идёт — дождитесь завершения или нажмите «Стоп»')
    }
  }

  const [panicAt, sentToday, { candidates, skips }] = await Promise.all([
    readPanicAt(client),
    countSentToday(client, deps.now()),
    loadCandidates(client),
  ])

  const slots = Math.max(0, DAILY_APPLICATION_LIMIT - sentToday)
  const maxSends = Math.min(slots, options.limit ?? DAILY_APPLICATION_LIMIT)

  const result: ApplyResult = {
    runId: run?.id ?? null,
    mode,
    startedAt,
    finishedAt: startedAt,
    sent: 0,
    failed: 0,
    skipped: skips.length,
    planned: candidates.slice(0, maxSends).map((candidate) => ({
      vacancyId: candidate.vacancyId,
      hhId: candidate.hhId,
      title: candidate.title,
      company: candidate.company,
      url: candidate.url,
      variant: candidate.variant,
      body: candidate.body,
      charCount: candidate.charCount,
    })),
    skips,
    stopped: 'none',
    message: '',
  }

  const blocked: ApplyStopReason | null = panicAt
    ? 'panic'
    : !isApplyWindowOpen(now)
      ? 'window'
      : maxSends === 0
        ? 'limit'
        : null

  if (mode === 'dry') {
    const head = autoApplyEnabled ? 'Сухой прогон' : 'HH_AUTO_APPLY выключен — только сухой прогон'
    result.stopped = blocked ?? 'none'
    result.message = `${head}: отправил бы ${result.planned.length} из ${candidates.length} одобренных${
      blocked ? ` · ${describeStop(blocked, now)}` : ''
    }`
    result.finishedAt = deps.now().toISOString()
    const dryRun = await client.run.create({
      data: {
        kind: 'apply',
        status: 'done',
        startedAt: now,
        finishedAt: deps.now(),
        note: result.message,
        stats: JSON.stringify(statsOf(result)),
      },
    })
    result.runId = dryRun.id
    await logAction(client, { message: result.message, meta: statsOf(result), runId: dryRun.id })
    return result
  }

  result.runId = run?.id ?? null

  if (blocked) {
    result.stopped = blocked
    result.message = liveMessage(result, deps.now())
    await logAction(client, {
      level: 'warn',
      message: `Прогон не начат: ${describeStop(blocked, deps.now())}`,
      runId: result.runId,
    })
    if (run) {
      await finishRun(client, run.id, 'done', result.message, deps.now(), statsOf(result))
    }
    result.finishedAt = deps.now().toISOString()
    return result
  }

  if (!run) {
    throw new ApplyError(500, 'Прогон не создан — повторите запуск')
  }

  const visible = candidates.slice(0, maxSends)

  for (const candidate of visible) {
    if (await readPanicAt(client)) {
      result.stopped = 'panic'
      break
    }

    if (!isApplyWindowOpen(deps.now())) {
      result.stopped = 'window'
      break
    }

    const claimed = await client.application.updateMany({
      where: { id: candidate.applicationId, status: 'approved' },
      data: { status: 'sending', error: null, letterId: candidate.letterId },
    })

    if (claimed.count === 0) {
      continue
    }

    const target: ApplyTarget = {
      vacancyId: candidate.vacancyId,
      hhId: candidate.hhId,
      title: candidate.title,
      company: candidate.company,
      url: candidate.url,
      variant: candidate.variant,
      body: candidate.body,
      charCount: candidate.charCount,
    }

    try {
      const sendResult = await deps.sender(target)
      const sentAt = deps.now()

      await client.application.update({
        where: { id: candidate.applicationId },
        data: { status: 'sent', sentAt, error: null },
      })
      result.sent += 1

      await logAction(client, {
        message: `Отправлен отклик: «${candidate.title}» — ${candidate.company}`,
        meta: {
          hhId: candidate.hhId,
          variant: candidate.variant,
          charCount: candidate.charCount,
          alreadyApplied: sendResult.alreadyApplied,
        },
        runId: result.runId,
      })

      if (sendResult.alreadyApplied) {
        await logAction(client, {
          level: 'warn',
          message: `hh уже показывал отклик по «${candidate.title}» — отмечено как отправленное`,
          runId: result.runId,
        })
      }
    } catch (error) {
      if (error instanceof HhBlockedError) {
        await client.application.update({
          where: { id: candidate.applicationId },
          data: { status: 'needs_human', error: error.message },
        })
        result.stopped = 'blocked'
        await logAction(client, {
          level: 'error',
          message: error.message,
          meta: { reason: error.reason },
          runId: result.runId,
        })
        break
      }

      const message = shortError(error)
      await client.application.update({
        where: { id: candidate.applicationId },
        data: { status: 'failed', error: message },
      })
      result.failed += 1
      result.stopped = 'error'
      await logAction(client, {
        level: 'error',
        message: `Ошибка отправки «${candidate.title}»: ${message}`,
        runId: result.runId,
      })
      break
    }

    if (result.sent + result.failed >= maxSends && candidates.length > maxSends) {
      result.stopped = 'limit'
      break
    }

    if (!(await waitBetweenActions(deps))) {
      result.stopped = 'panic'
      break
    }
  }

  const runStatus: RunStatus =
    result.stopped === 'blocked' ? 'needs_human' : result.stopped === 'error' ? 'failed' : 'done'

  result.finishedAt = deps.now().toISOString()
  result.message = liveMessage(result, deps.now())

  await finishRun(client, run.id, runStatus, result.message, deps.now(), statsOf(result))

  return result
}

/** Ручная отправка одной карточки: те же лимиты и окно, без паузы ожидания. */
export async function sendApprovedNow(
  vacancyId: string,
  deps: Partial<ApplyDeps> = {},
): Promise<ManualSendResponse> {
  const merged: ApplyDeps = { ...defaultDeps, ...deps }
  const { client } = merged
  const now = merged.now()

  const application = await client.application.findUnique({
    where: { vacancyId },
    include: { letter: true, vacancy: { include: { letter: true } } },
  })

  if (!application) {
    throw new ApplyError(404, 'Отклик не найден в очереди — сначала одобри вакансию')
  }

  if (application.status !== 'approved') {
    throw new ApplyError(409, 'Отправить сейчас можно только одобренный отклик')
  }

  const letter = application.letter ?? application.vacancy.letter
  if (!letter) {
    throw new ApplyError(409, 'Письмо не собрано — сначала прогони pnpm hh:letters')
  }

  await assertReadyToSend(client, now)

  const target: ApplyTarget = {
    vacancyId,
    hhId: application.vacancy.hhId,
    title: application.vacancy.title,
    company: application.vacancy.company,
    url: application.vacancy.url,
    variant: letter.variant as LetterVariant,
    body: letter.body,
    charCount: letter.charCount,
  }

  const run = await client.run.create({
    data: {
      kind: 'apply',
      status: 'running',
      startedAt: now,
      note: `ручная отправка: ${application.vacancy.title}`,
    },
  })

  let outcome: RunStatus = 'failed'
  let note = 'ручная отправка прервана'

  try {
    const claimed = await client.application.updateMany({
      where: { id: application.id, status: 'approved' },
      data: { status: 'sending', error: null, letterId: letter.id },
    })

    if (claimed.count === 0) {
      throw new ApplyError(409, 'Отклик уже отправляется или отправлен')
    }

    const sendResult = await merged.sender(target)
    const sentAt = merged.now()

    await client.application.update({
      where: { id: application.id },
      data: { status: 'sent', sentAt, error: null },
    })

    await logAction(client, {
      message: `Отправлен отклик вручную: «${application.vacancy.title}»`,
      meta: {
        hhId: application.vacancy.hhId,
        variant: target.variant,
        charCount: target.charCount,
        alreadyApplied: sendResult.alreadyApplied,
      },
      runId: run.id,
    })

    outcome = 'done'
    note = `ручная отправка: «${application.vacancy.title}»`

    return { status: 'sent', message: `Отклик отправлен: «${application.vacancy.title}»` }
  } catch (error) {
    if (error instanceof HhBlockedError) {
      await client.application.update({
        where: { id: application.id },
        data: { status: 'needs_human', error: error.message },
      })
      outcome = 'needs_human'
      note = error.message
      await logAction(client, {
        level: 'error',
        message: error.message,
        meta: { reason: error.reason },
        runId: run.id,
      })
      throw new ApplyError(409, error.message)
    }

    if (error instanceof ApplyError) {
      note = error.message
      throw error
    }

    const message = shortError(error)
    await client.application
      .update({
        where: { id: application.id },
        data: { status: 'failed', error: message },
      })
      .catch(() => undefined)
    note = `ручная отправка не удалась: ${message}`
    await logAction(client, { level: 'error', message: note, runId: run.id })
    throw new ApplyError(502, `hh не принял отклик: ${message}`)
  } finally {
    await finishRun(client, run.id, outcome, note, merged.now(), {
      mode: 'live',
      manual: true,
      sent: outcome === 'done' ? 1 : 0,
    })
  }
}

/** Состояние отправки для UI: окно, лимит, panic и последний прогон. */
export async function readApplyStatus(
  client: PrismaClient = prisma,
  now = new Date(),
): Promise<ApplyStatus> {
  const [panicAt, sentToday, active, lastRun] = await Promise.all([
    readPanicAt(client),
    countSentToday(client, now),
    findActiveRun(client, now),
    client.run.findFirst({ where: { kind: 'apply' }, orderBy: { startedAt: 'desc' } }),
  ])

  const summary: ApplyRunSummary | null = lastRun
    ? {
        id: lastRun.id,
        status: lastRun.status as RunStatus,
        startedAt: lastRun.startedAt.toISOString(),
        finishedAt: lastRun.finishedAt?.toISOString() ?? null,
        message: lastRun.note,
      }
    : null

  return {
    autoApplyEnabled: isAutoApplyEnabled(),
    windowOpen: isApplyWindowOpen(now),
    panicAt: panicAt?.toISOString() ?? null,
    sentToday,
    dailyLimit: DAILY_APPLICATION_LIMIT,
    active: active !== null,
    lastRun: summary,
  }
}

/** Ошибка фонового прогона: в журнал, чтобы она не потерялась в консоли сервера. */
export async function logApplyFailure(
  error: unknown,
  client: PrismaClient = prisma,
): Promise<void> {
  await client.actionLog.create({
    data: {
      kind: 'apply',
      level: 'error',
      message: `Фоновый прогон упал: ${shortError(error)}`,
    },
  })
}
