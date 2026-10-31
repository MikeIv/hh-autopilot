import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'

/**
 * Профиль Playwright с сессией hh. Живёт в соседнем пакете `resume-site`
 * (в git не попадает): логин выполняет человек, агент сессию только использует.
 */
export const DEFAULT_HH_PROFILE_DIR = resolve(
  process.cwd(),
  '..',
  'resume-site',
  '.dsh',
  'hh-profile',
)

/** `HH_PROFILE_DIR` перекрывает путь по умолчанию; относительный путь — от корня проекта. */
export function hhProfileDir(path = process.env.HH_PROFILE_DIR): string {
  if (!path) {
    return DEFAULT_HH_PROFILE_DIR
  }
  return resolve(process.cwd(), path)
}

/** Причина остановки: без человека дальше идти нельзя. */
export type HhBlockReason = 'login' | 'captcha'

/** Капча или истёкшая сессия — не ошибка кода, а стоп-сигнал: статус `needs_human`. */
export class HhBlockedError extends Error {
  readonly reason: HhBlockReason

  constructor(reason: HhBlockReason, message: string) {
    super(message)
    this.name = 'HhBlockedError'
    this.reason = reason
  }
}

/** Открывает hh сохранённой сессией. Без сети и без headless-подмен: обычный Chromium. */
export async function launchHhContext(): Promise<BrowserContext> {
  const dir = hhProfileDir()
  await mkdir(dir, { recursive: true })

  return chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1440, height: 960 },
    locale: 'ru-RU',
  })
}

/** Признаки остановки: hh увёл на вход или просит подтвердить, что мы не робот. */
export function hhBlockReason(url: string, html: string): HhBlockReason | null {
  if (url.includes('/account/login')) {
    return 'login'
  }
  if (
    url.includes('captcha') ||
    html.includes('data-qa="captcha"') ||
    /подтвердите, что вы не робот/i.test(html)
  ) {
    return 'captcha'
  }
  return null
}

/** Открывает страницу hh и отдаёт её HTML. Капча и login — `HhBlockedError`, а не «пустая выдача». */
export async function openHhPage(
  context: BrowserContext,
  url: string,
  settleMs = 2500,
): Promise<{ html: string; page: Page }> {
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settleMs)

  const html = await page.content()
  const reason = hhBlockReason(page.url(), html)
  if (reason) {
    const hint =
      reason === 'login'
        ? 'сессия hh истекла, нужен вход человеком'
        : 'hh просит подтвердить, что действие делает человек'
    throw new HhBlockedError(reason, `Остановка hh: ${hint} (${page.url()})`)
  }

  return { html, page }
}
