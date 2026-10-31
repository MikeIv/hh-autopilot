import './env'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { launchHhContext, openHhPage } from '../server/utils/hh-session'
import { parseApplyPage } from '../shared/utils/apply-page'

/**
 * Снимает страницу вакансии hh в HTML-фикстуру для разбора кнопки отклика.
 * Кнопку «Откликнуться» не нажимает: клик может отправить отклик, а отправка
 * без одобрения человека запрещена. С `--form` открывает ту же страницу формы
 * отклика, на которую ведёт кнопка, и сохраняет её разметку — без отправки.
 */
const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'apply')

/** Узлы, по которым видно состояние отклика: заголовок, компания и кнопки hh. */
const SELECTORS = [
  'h1[data-qa="vacancy-title"]',
  '[data-qa="vacancy-company-name"]',
  '[data-qa^="vacancy-response"]',
]

/** Узлы формы отклика: сама форма hh и всё, что помечено метками отклика. */
const FORM_SELECTORS = [
  'form[name="vacancy_response"]',
  '[data-qa^="vacancy-response"]',
  '[data-qa*="letter"]',
]

/** Кнопка отклика: её href ведёт на страницу формы, где лежит поле письма. */
const APPLY_BUTTON =
  '[data-qa="vacancy-response-link-top"], [data-qa="vacancy-response-link-bottom"]'

/** В фикстуру не должны попадать почта, телефон и токен формы: вычищаем. */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/name="_xsrf"\s+value="[^"]*"/gi, 'name="_xsrf" value="[xsrf]"')
    .replace(/value="[^"]*"\s+name="_xsrf"/gi, 'value="[xsrf]" name="_xsrf"')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\+7[\s(-]*\d{3}[)\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, '[phone]')
}

function readArgs(): { url: string; name: string; form: boolean } {
  const args = process.argv.slice(2)
  const form = args.includes('--form')
  const [raw, name] = args.filter((arg) => arg !== '--form')

  if (!raw) {
    throw new Error('Использование: pnpm hh:apply:fixture <hhId|url> [имя] [--form]')
  }

  const url = /^\d+$/.test(raw) ? `https://hh.ru/vacancy/${raw}` : raw
  if (!/^https:\/\/hh\.ru\/vacancy\//.test(url)) {
    throw new Error(`Ссылка должна вести на вакансию hh: ${raw}`)
  }

  const fixtureName = name ?? raw.replace(/\D/g, '').slice(0, 40)
  if (!/^[a-z0-9-]{1,40}$/.test(fixtureName)) {
    throw new Error(`Имя фикстуры — латиница в нижнем регистре, цифры и дефис: ${fixtureName}`)
  }

  return { url, name: fixtureName, form }
}

/** Собирает HTML выбранных узлов: без скриптов, почты и телефонов. */
async function markupOf(page: Page, selectors: readonly string[]): Promise<string> {
  const markup = await page.evaluate((list) => {
    const seen = new Set<Element>()
    const parts: string[] = []

    for (const selector of list) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node)) {
          continue
        }
        seen.add(node)
        parts.push(node.outerHTML)
      }
    }

    return parts.join('\n')
  }, selectors)

  return sanitize(markup)
}

async function main(): Promise<void> {
  const { url, name, form } = readArgs()
  await mkdir(FIXTURES_DIR, { recursive: true })

  const context = await launchHhContext()

  try {
    const { html, page } = await openHhPage(context, url)
    const state = parseApplyPage(html)

    const markup = await markupOf(page, SELECTORS)
    if (!markup) {
      throw new Error('На странице вакансии не нашлось узлов отклика — разметка hh изменилась')
    }

    const document = `<!doctype html>
<html lang="ru">
<body>
${markup}
</body>
</html>
`
    const file = join(FIXTURES_DIR, `${name}.html`)
    await writeFile(file, document, 'utf8')

    console.log(`Фикстура: tests/fixtures/apply/${name}.html`)
    console.log(
      `Кнопка отклика: ${state.hasApplyButton ? 'есть' : 'нет'} · уже отправлен: ${
        state.alreadyApplied ? 'да' : 'нет'
      } · байт: ${document.length}`,
    )

    if (form) {
      const href = await page.locator(APPLY_BUTTON).first().getAttribute('href')
      if (!href) {
        throw new Error('У кнопки отклика нет href — форма отклика недоступна без клика')
      }

      const responseUrl = new URL(href, 'https://hh.ru').toString()
      const response = await openHhPage(context, responseUrl)
      const formState = parseApplyPage(response.html)
      const formMarkup = await markupOf(response.page, FORM_SELECTORS)

      if (!formMarkup) {
        throw new Error('На странице формы отклика не нашлось узлов формы')
      }

      const formDocument = `<!doctype html>
<html lang="ru">
<body>
${formMarkup}
</body>
</html>
`
      const formFile = join(FIXTURES_DIR, `${name}-form.html`)
      await writeFile(formFile, formDocument, 'utf8')

      console.log(`Форма отклика: tests/fixtures/apply/${name}-form.html`)
      console.log(
        `Поле письма: ${formState.hasLetterField ? 'есть' : 'нет'} · кнопка отправки: ${
          formState.hasSubmitButton ? 'есть' : 'нет'
        } · байт: ${formDocument.length}`,
      )
    }
  } finally {
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
