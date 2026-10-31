import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadPortrait } from '../server/utils/portrait'
import { buildSearchUrl } from '../shared/utils/hh-search'
import { launchHhContext, openHhPage } from '../server/utils/hh-session'

/**
 * Снимает выдачу hh в HTML-фикстуру: разбор выдачи тестируется без сети.
 * Сохраняется только контейнер с вакансиями — шапка профиля и скрипты не нужны.
 */
const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'serp')

/** Контейнер выдачи и карточка: по ним разбор и находит вакансии в разметке. */
const RESULTS_SELECTOR = '[data-qa="vacancy-serp__results"]'
const CARD_SELECTOR = '[data-qa="vacancy-serp__vacancy"]'

/** По умолчанию в фикстуру идут пять карточек: этого хватает на все варианты разметки. */
const DEFAULT_CARDS = 5

async function readArgs(): Promise<{ query: string; name: string; cards: number }> {
  const [query, name, rawCards] = process.argv.slice(2)

  if (!query || !name) {
    throw new Error('Использование: pnpm hh:fixture "<запрос>" <имя-фикстуры> [карточек]')
  }
  if (!/^[a-z0-9-]{1,40}$/.test(name)) {
    throw new Error(`Имя фикстуры — латиница в нижнем регистре, цифры и дефис: ${name}`)
  }

  const cards = rawCards ? Number(rawCards) : DEFAULT_CARDS
  if (!Number.isInteger(cards) || cards < 1) {
    throw new Error(`Карточек должно быть положительное число, получено: ${rawCards}`)
  }

  return { query, name, cards }
}

async function main(): Promise<void> {
  const { query, name, cards } = await readArgs()
  const portrait = await loadPortrait()
  const url = buildSearchUrl(portrait, query)

  await mkdir(FIXTURES_DIR, { recursive: true })

  const context = await launchHhContext()

  try {
    const { html, page } = await openHhPage(context, url)
    const markup = await page.evaluate(
      ({ results, card, limit }) => {
        const node = document.querySelector(results)
        if (!node) {
          return null
        }
        return [...node.querySelectorAll(card)]
          .slice(0, limit)
          .map((item) => item.outerHTML)
          .join('\n')
      },
      { results: RESULTS_SELECTOR, card: CARD_SELECTOR, limit: cards },
    )

    if (!markup) {
      await writeFile(join(FIXTURES_DIR, 'debug-page.html'), html, 'utf8')
      throw new Error(
        `Контейнер ${RESULTS_SELECTOR} не найден, полный HTML сохранён в tests/fixtures/serp/debug-page.html`,
      )
    }

    const document = `<!doctype html>
<html lang="ru">
<body>
<div data-qa="vacancy-serp__results">
<ol>
${markup}
</ol>
</div>
</body>
</html>
`
    const file = join(FIXTURES_DIR, `${name}.html`)
    await writeFile(file, document, 'utf8')

    const total = await page.locator(CARD_SELECTOR).count()
    console.log(`Фикстура: tests/fixtures/serp/${name}.html`)
    console.log(
      `Запрос: ${query} · карточек на странице: ${total}, в фикстуре: ${Math.min(cards, total)} · байт: ${document.length}`,
    )
  } finally {
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
