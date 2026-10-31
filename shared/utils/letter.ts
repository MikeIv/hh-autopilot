import type { CandidatePortrait } from '../types/portrait'
import type { LetterDraft, LetterVacancy } from '../types/letter'
import type { LetterVariant } from '../types/domain'
import { LETTER_VARIANTS } from '../types/domain'
import { matchedTech } from './scorer'

/**
 * Предел длины письма. hh жёстко поле не ограничивает, но советует 1000–1700
 * знаков: держим верхнюю границу, чтобы письмо читали, а не пролистывали.
 */
export const LETTER_MAX_CHARS = 1700

/** Признаки типа вакансии: по ним выбирается вариант письма. */
const VARIANT_MARKERS: ReadonlyArray<readonly [LetterVariant, RegExp]> = [
  ['outstaff', /аутстафф|аутсорс|outstaff|outstaffing|staff augmentation/iu],
  ['service', /веб-студи|студи|на заказ|сервисн|подряд|разработка сайтов|агентств/iu],
  ['product', /продукт|product|saas|платформ|маркетплейс/iu],
]

/** Тип вакансии по заголовку, компании и описанию; без признаков — продуктовый вариант. */
export function detectVariant(vacancy: LetterVacancy): LetterVariant {
  const text = [vacancy.title, vacancy.company, vacancy.description ?? ''].join(' ')

  for (const [variant, marker] of VARIANT_MARKERS) {
    if (marker.test(text)) {
      return variant
    }
  }

  return 'product'
}

/** Тезис варианта: только факты из резюме, без выдуманных цифр и обещаний. */
function variantParagraph(portrait: CandidatePortrait, variant: LetterVariant): string {
  const current = portrait.experience[0]
  if (!current) {
    return 'Опыт и проекты — в резюме в профиле hh.'
  }

  const previous = portrait.experience[1] ?? current
  const earlier =
    previous === current ? '' : `, до этого «${previous.company}» (${previous.position})`
  const company = `«${current.company}»`
  const position = current.position
  const fact = current.achievements[0] ? ` ${current.achievements[0]}` : ''

  if (variant === 'outstaff') {
    return `Привык работать в команде заказчика: сейчас ${company} (${position})${earlier}.${fact}`
  }

  if (variant === 'service') {
    return `Каждый день делаю коммерческие проекты для клиентов студии: ${company} — бронирование, личные кабинеты, медиа.${fact}`
  }

  return `Сейчас работаю в компании ${company} на позиции «${position}»: веду интерфейс и серверную часть в одном стеке Nuxt и Nitro, логику закрываю тестами.${fact}`
}

/** Собирает письмо нужного объёма: лишние абзацы отбрасываются, а не обрезаются посередине. */
function fitParts(parts: readonly string[]): string {
  const kept: string[] = []

  for (const part of parts) {
    const candidate = [...kept, part].join('\n\n')
    if (candidate.length <= LETTER_MAX_CHARS) {
      kept.push(part)
    }
  }

  return kept.join('\n\n')
}

/** Письмо под вакансию: факты из портрета, стек из вакансии, объём в пределах лимита. */
export function buildLetter(
  portrait: CandidatePortrait,
  vacancy: LetterVacancy,
  variant: LetterVariant,
): LetterDraft {
  const stack = matchedTech(portrait, [vacancy.title, vacancy.description ?? ''].join(' ')).slice(
    0,
    5,
  )
  const hasCompany = vacancy.company.trim().length > 0

  const body = fitParts([
    'Здравствуйте!',
    `Откликаюсь на вакансию «${vacancy.title}»${hasCompany ? ` (${vacancy.company})` : ''}.`,
    stack.length
      ? `Из требуемого стека работаю с ${stack.join(', ')}.`
      : `Мой стек — ${portrait.basics.label}.`,
    portrait.basics.headline ?? portrait.basics.label,
    variantParagraph(portrait, variant),
    'Резюме и проекты — в профиле hh. Готов обсудить задачи и ближайшие шаги.',
  ])

  return { variant, body, charCount: body.length }
}

/** Варианты под разные типы вакансий: человек выбирает в очереди ревью. */
export function letterVariants(portrait: CandidatePortrait, vacancy: LetterVacancy): LetterDraft[] {
  return LETTER_VARIANTS.map((variant) => buildLetter(portrait, vacancy, variant))
}

/** Рекомендованный вариант: по типу вакансии, с тем же лимитом длины. */
export function recommendedLetter(
  portrait: CandidatePortrait,
  vacancy: LetterVacancy,
): LetterDraft {
  return buildLetter(portrait, vacancy, detectVariant(vacancy))
}
