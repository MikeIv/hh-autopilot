import { setTimeout as sleep } from 'node:timers/promises'
import type { Locator, Page } from 'playwright'
import { HhBlockedError, hhBlockReason, launchHhContext, openHhPage } from '../utils/hh-session'
import { parseApplyPage } from '../../shared/utils/apply-page'
import type { ApplyTarget, SendResult } from '../../shared/types/apply'

/**
 * Селекторы формы отклика hh. Кнопка отклика снята сохранённой сессией в фикстуру
 * `tests/fixtures/apply/vacancy.html`; остальные метки — data-qa hh с запасными
 * вариантами: hh меняет разметку, и падать на первом несовпадении нельзя.
 */
const APPLY_BUTTONS = [
  '[data-qa="vacancy-response-link-top"]',
  '[data-qa="vacancy-response-link-bottom"]',
  'a[data-qa*="vacancy-response-link"]',
]

const LETTER_FIELDS = [
  'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
  '[data-qa="vacancy-response-letter-input"]',
  '[data-qa="vacancy-response-popup-form-letter"] textarea',
  'textarea[name="letter"]',
  'textarea[data-qa*="letter"]',
]

const SUBMIT_BUTTONS = [
  '[data-qa="vacancy-response-submit-popup"]',
  '[data-qa="vacancy-response-submit"]',
  'form[name="vacancy_response"] button[type="submit"]',
]

/** Сколько ждём открытия формы после клика и подтверждения после отправки. */
const FORM_TIMEOUT_MS = 15_000
const SUBMIT_SETTLE_MS = 3000

/** Первый существующий и видимый локатор из списка: hh держит по два варианта кнопок. */
async function findVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) === 0) {
      continue
    }
    if (await locator.isVisible().catch(() => false)) {
      return locator
    }
  }
  return null
}

/** Ждёт появления элемента: модалка hh подгружается после клика, а не сразу. */
async function waitForVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const locator = await findVisible(page, selectors)
    if (locator) {
      return locator
    }
    await page.waitForTimeout(250)
  }
  return null
}

/** Капча или истёкший логин посреди действия — та же остановка, что и при сборе. */
async function assertNotBlocked(page: Page): Promise<void> {
  const reason = hhBlockReason(page.url(), await page.content())
  if (reason) {
    throw new HhBlockedError(
      reason,
      reason === 'login'
        ? 'Сессия hh истекла при отправке отклика — нужен вход человеком'
        : 'hh просит подтвердить, что действие делает человек',
    )
  }
}

/**
 * Отправляет отклик через интерфейс hh так же, как это делает человек: открывает
 * вакансию, нажимает «Откликнуться», вставляет письмо и отправляет форму.
 * Никаких внутренних запросов и обходов капчи: только клики в браузере.
 */
export async function sendApplication(target: ApplyTarget): Promise<SendResult> {
  const context = await launchHhContext()

  try {
    const { html, page } = await openHhPage(context, target.url)
    const state = parseApplyPage(html)

    if (state.alreadyApplied) {
      return { applied: false, alreadyApplied: true }
    }

    const button = await findVisible(page, APPLY_BUTTONS)
    if (!button) {
      throw new Error(
        'На странице вакансии нет кнопки «Откликнуться»: разметка hh изменилась или вакансия недоступна',
      )
    }

    await button.click()
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)

    const field = await waitForVisible(page, LETTER_FIELDS, FORM_TIMEOUT_MS)
    if (!field) {
      await assertNotBlocked(page)
      throw new Error(
        'Форма отклика не открылась: поля сопроводительного письма нет — возможно, вакансия просит тест или другой отклик',
      )
    }

    await assertNotBlocked(page)
    await field.fill(target.body)

    const submit = await findVisible(page, SUBMIT_BUTTONS)
    if (!submit) {
      throw new Error('В форме отклика нет кнопки отправки')
    }

    await submit.click()
    await sleep(SUBMIT_SETTLE_MS)
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    await assertNotBlocked(page)

    const after = parseApplyPage(await page.content())
    const fieldStillVisible = await findVisible(page, LETTER_FIELDS)

    if (after.alreadyApplied || !fieldStillVisible) {
      return { applied: true, alreadyApplied: false }
    }

    const hint = await errorHint(page)
    throw new Error(
      `hh не подтвердил отправку отклика: форма осталась открытой${hint ? ` — ${hint}` : ''}`,
    )
  } finally {
    await context.close()
  }
}

/** Видимый текст ошибки hh: он помогает человеку понять, почему отклик не ушёл. */
async function errorHint(page: Page): Promise<string | null> {
  const locator = page.locator('[data-qa="form-error"], [role="alert"], .bloko-form-error').first()

  if ((await locator.count()) === 0) {
    return null
  }

  const text = (await locator.textContent().catch(() => null))?.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 200) : null
}
