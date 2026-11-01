import { prisma } from '../utils/db'
import { HhBlockedError } from '../utils/hh-session'
import { loadPortrait } from '../utils/portrait'
import type { RefreshResult, RefreshStatus } from '../../shared/types/refresh'
import { collectPortrait, type CollectStats } from './collector'
import { generateLetters, type LetterStats } from './letter'
import { scoreAllVacancies, type ScoreStats } from './scorer'

/** Ошибка обновления, которую API отдаёт статусом, а не падением страницы. */
export class RefreshError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'RefreshError'
    this.statusCode = statusCode
  }
}

/** Шаги обновления. В тестах подменяются, чтобы не открывать hh. */
export interface RefreshDeps {
  collect: () => Promise<CollectStats>
  score: () => Promise<ScoreStats>
  letters: () => Promise<LetterStats>
  applyRunning: () => Promise<boolean>
}

const empty: RefreshStatus = {
  running: false,
  error: null,
  result: null,
  finishedAt: null,
}

let state: RefreshStatus = { ...empty }
let pending: Promise<void> | null = null

/** Как у прогона отправки: старше получаса — уже не держит браузер. */
const APPLY_RUN_STALE_MS = 30 * 60_000

const defaultDeps: RefreshDeps = {
  collect: async () => collectPortrait(await loadPortrait()),
  score: () => scoreAllVacancies(),
  letters: () => generateLetters(),
  applyRunning: async () => {
    const since = new Date(Date.now() - APPLY_RUN_STALE_MS)
    const active = await prisma.run.findFirst({
      where: { kind: 'apply', status: 'running', startedAt: { gte: since } },
      select: { id: true },
    })
    return active !== null
  },
}

/** Идёт ли обновление выдачи. Отправка откликов в этот момент не открывает второй браузер. */
export function isRefreshRunning(): boolean {
  return state.running
}

/** Текущее состояние для кнопки. */
export function readRefreshStatus(): RefreshStatus {
  return { ...state }
}

/** Ждёт фоновый прогон. Нужен тестам: ответ POST уходит сразу, работа продолжается на сервере. */
export function waitForRefresh(): Promise<void> {
  return pending ?? Promise.resolve()
}

/** Сбрасывает состояние между тестами. В работе приложения не вызывается. */
export function resetRefreshState(): void {
  state = { ...empty }
  pending = null
}

/** Запускает сбор, скоринг и письма. Повторный запуск, пока идёт первый, — ошибка 409. */
export async function startRefresh(overrides: Partial<RefreshDeps> = {}): Promise<RefreshStatus> {
  if (state.running) {
    throw new RefreshError(409, 'Обновление уже идёт — дождитесь окончания')
  }

  const deps: RefreshDeps = { ...defaultDeps, ...overrides }
  state = { running: true, error: null, result: null, finishedAt: null }

  try {
    if (await deps.applyRunning()) {
      state = { running: false, error: null, result: null, finishedAt: null }
      throw new RefreshError(409, 'Сейчас идёт отправка откликов — браузер hh занят')
    }
  } catch (error) {
    if (!(error instanceof RefreshError)) {
      state = {
        running: false,
        error: refreshErrorMessage(error),
        result: null,
        finishedAt: new Date().toISOString(),
      }
    }
    throw error
  }

  pending = execute(deps)
  return { ...state }
}

/** Сбор с hh, затем оценка и письма: без этого новые карточки не появятся в очереди. */
async function execute(deps: RefreshDeps): Promise<void> {
  try {
    const collected = await deps.collect()
    const scored = await deps.score()
    const letters = await deps.letters()
    const result: RefreshResult = {
      queries: [...collected.queries],
      found: collected.found,
      created: collected.created,
      updated: collected.updated,
      unchanged: collected.unchanged,
      scored: scored.scored,
      passed: scored.passed,
      letters: letters.generated,
    }

    state = {
      running: false,
      error: null,
      result,
      finishedAt: new Date().toISOString(),
    }
  } catch (error) {
    state = {
      running: false,
      error: refreshErrorMessage(error),
      result: null,
      finishedAt: new Date().toISOString(),
    }
  } finally {
    pending = null
  }
}

/** Капча и истёкший вход — просьба к человеку, а не техническая ошибка. */
function refreshErrorMessage(error: unknown): string {
  if (error instanceof HhBlockedError) {
    return error.reason === 'login'
      ? 'Сессия hh истекла. Запусти pnpm hh:login и обнови ещё раз.'
      : 'hh показал капчу. Запусти pnpm hh:login и обнови ещё раз.'
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return 'Не удалось обновить выдачу hh'
}
