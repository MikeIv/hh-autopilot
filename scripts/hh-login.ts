import './env'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { hhProfileDir } from '../server/utils/hh-session'

const LOGIN_URL = 'https://hh.ru/account/login'

/** Логин, пароль и код из SMS вводит человек — ждём до 15 минут. */
const LOGIN_WAIT_MS = 15 * 60 * 1000
const POLL_MS = 2000
/** Страница должна трижды подряд оказаться вне формы входа: hh редиректит поэтапно. */
const CONFIRMATIONS = 3

/** Страница ушла с формы логина на hh — значит человек вошёл. */
function isLoggedIn(page: Page | undefined): boolean {
  const url = page?.url() ?? ''
  return url.includes('hh.ru') && !url.includes('/account/login')
}

/** Ждёт ручной вход и отдаёт страницу, на которой он завершился. */
async function waitForLogin(pages: () => Page[]): Promise<Page> {
  const startedAt = Date.now()
  let confirmations = 0

  while (Date.now() - startedAt < LOGIN_WAIT_MS) {
    const page = pages().at(-1)
    confirmations = isLoggedIn(page) ? confirmations + 1 : 0
    if (page && confirmations >= CONFIRMATIONS) {
      return page
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }

  throw new Error(
    `Вход не завершён за ${LOGIN_WAIT_MS / 60_000} мин. Запустите pnpm hh:login заново.`,
  )
}

/** Открывает hh.ru в видимом окне: человек входит сам, профиль сохраняет сессию. */
async function main(): Promise<void> {
  const dir = hhProfileDir()
  await mkdir(dir, { recursive: true })

  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: 'ru-RU',
  })

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
    console.log('Войдите на hh.ru в открытом окне: логин, пароль и код из SMS — ваши.')
    console.log(`Профиль: ${dir}. Ждём вход до ${LOGIN_WAIT_MS / 60_000} мин.`)

    await waitForLogin(() => context.pages())
    console.log('Вход выполнен, сессия сохранена. Дальше: pnpm hh:collect.')
  } finally {
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
