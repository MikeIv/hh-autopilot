import { parseDocument } from 'htmlparser2'
import type { Currency, VacancyCard } from '../types/vacancy'

type Document = ReturnType<typeof parseDocument>
type Node = Document['children'][number]

/** Дети узла: у текста и комментариев их нет, у элементов и корня — есть. */
function childrenOf(node: Node): readonly Node[] {
  return 'children' in node ? node.children : []
}

/** Обход поддерева сверху вниз: поля карточки разбросаны по вложенным блокам hh. */
function* walk(nodes: readonly Node[]): Generator<Node> {
  for (const node of nodes) {
    yield node
    yield* walk(childrenOf(node))
  }
}

/** Текст элемента без разметки: пробелы схлопываются, `&nbsp;` уже раскодирован. */
function textOf(node: Node): string {
  if (node.type === 'text') {
    return node.data
  }
  return childrenOf(node).map(textOf).join(' ')
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Подпись бейджа: пустой узел не становится пустой строкой в карточке. */
function labeled(node: Node | undefined): string | null {
  if (!node) {
    return null
  }
  const value = clean(textOf(node))
  return value || null
}

/** Адрес картинки логотипа. Берём только абсолютный src, без встроенных данных. */
function imageSrc(root: Node | undefined): string | null {
  if (!root) {
    return null
  }
  for (const node of walk([root])) {
    if (node.type !== 'tag' || node.name !== 'img') {
      continue
    }
    const src = node.attribs.src?.trim() ?? ''
    if (/^https?:\/\//.test(src)) {
      return src
    }
  }
  return null
}

/** Маркер разметки hh: на `data-qa` держатся заголовок, работодатель, адрес и метки. */
const dataQa = (node: Node): string => (node.type === 'tag' ? (node.attribs['data-qa'] ?? '') : '')

const CARD_QA = 'vacancy-serp__vacancy'
const EXPERIENCE_PREFIX = 'vacancy-serp__vacancy-work-experience-'
const SCHEDULE_PREFIX = 'vacancy-label-work-schedule-'

/** Валюта в карточке hh → валюта портрета: скорер сравнивает их напрямую. */
const CURRENCIES: Record<string, Currency> = { '₽': 'RUR', $: 'USD', '€': 'EUR' }

/** «от 200 000 ₽», «250 000 – 350 000 ₽», «до 300 000 ₽»: префикс, числа, валюта. */
const SALARY = /(?:(от|до)\s*)?(\d[\d\s\u00a0]*)(?:[–—−-]\s*(\d[\d\s\u00a0]*))?\s*(₽|\$|€)/

/** Достаёт из текста карточки только числовые поля зарплаты. */
function parseSalary(text: string): Pick<VacancyCard, 'salaryFrom' | 'salaryTo' | 'currency'> {
  const match = SALARY.exec(text)
  const first = match?.[2]
  const sign = match?.[4]
  if (!match || !first || !sign) {
    return { salaryFrom: null, salaryTo: null, currency: null }
  }

  const prefix = match[1]
  const amount = (raw: string): number => Number(raw.replace(/[\s\u00a0]/g, ''))
  const currency = CURRENCIES[sign] ?? null
  const second = match[3] ? amount(match[3]) : null

  if (second !== null) {
    return { salaryFrom: amount(first), salaryTo: second, currency }
  }
  if (prefix === 'до') {
    return { salaryFrom: null, salaryTo: amount(first), currency }
  }
  // «от X» — нижняя граница, «X» без префикса — фиксированная зарплата.
  return {
    salaryFrom: amount(first),
    salaryTo: prefix === 'от' ? null : amount(first),
    currency,
  }
}

/** Галочка, рейтинг hh и HR-бренд: один проход по узлам карточки. */
function employerMarks(nodes: readonly Node[]): {
  trusted: boolean
  hhRating: boolean
  hrBrand: boolean
} {
  let trusted = false
  let hhRating = false
  let hrBrand = false

  for (const node of nodes) {
    const qa = dataQa(node)
    if (qa === 'trusted-employer-link') {
      trusted = true
    } else if (qa.startsWith('vacancy-serp__vacancy_employer-hh-rating')) {
      hhRating = true
    } else if (qa.startsWith('vacancy-serp__vacancy_hrbrand')) {
      hrBrand = true
    }
    if (trusted && hhRating && hrBrand) {
      break
    }
  }

  return { trusted, hhRating, hrBrand }
}

/** Одна карточка выдачи: `null`, если разметка не дала обязательные поля. */
function parseCard(card: Node): VacancyCard | null {
  const nodes = [...walk([card])]
  const byQa = (value: string): Node | undefined => nodes.find((node) => dataQa(node) === value)
  const byPrefix = (prefix: string): Node | undefined =>
    nodes.find((node) => dataQa(node).startsWith(prefix))

  const titleLink = byQa('serp-item__title')
  const href = titleLink?.type === 'tag' ? titleLink.attribs.href : undefined
  const hhId = href?.match(/\/vacancy\/(\d+)/)?.[1]

  const employerNode =
    byQa('vacancy-serp__vacancy-employer-text') ?? byQa('vacancy-serp__vacancy-employer')
  const company = employerNode ? clean(textOf(employerNode)) : ''
  const employerLink = byQa('vacancy-serp__vacancy-employer')
  const employerHref = employerLink?.type === 'tag' ? employerLink.attribs.href : undefined
  const employerId = employerHref?.match(/\/employer\/(\d+)/)?.[1]

  const titleNode = byQa('serp-item__title-text') ?? titleLink
  const title = titleNode ? clean(textOf(titleNode)) : ''

  if (!hhId || !company || !title) {
    return null
  }

  const experienceMarker = byPrefix(EXPERIENCE_PREFIX)
  const scheduleMarker = byPrefix(SCHEDULE_PREFIX)
  const addressNode = byQa('vacancy-serp__vacancy-address')
  const marks = employerMarks(nodes)

  return {
    hhId,
    title,
    company,
    url: `https://hh.ru/vacancy/${hhId}`,
    employerUrl: employerId ? `https://hh.ru/employer/${employerId}` : null,
    employerTrusted: marks.trusted,
    employerRating: labeled(byQa('company-review-rating-value')),
    employerReviews: labeled(byQa('company-review-rating-reviews-count')),
    employerHhRating: marks.hhRating,
    employerHrBrand: marks.hrBrand,
    employerLogo: imageSrc(byQa('vacancy-serp__vacancy-employer-logo-image')),
    area: addressNode ? clean(textOf(addressNode)) : null,
    ...parseSalary(clean(textOf(card))),
    schedule: scheduleMarker ? dataQa(scheduleMarker).slice(SCHEDULE_PREFIX.length) : null,
    experience:
      experienceMarker?.type === 'tag'
        ? (experienceMarker.attribs.value ??
          dataQa(experienceMarker).slice(EXPERIENCE_PREFIX.length))
        : null,
  }
}

/** Вакансии из сохранённой выдачи hh. Дубли по `hhId` схлопываются внутри страницы. */
export function parseSerpPage(html: string): VacancyCard[] {
  const cards: VacancyCard[] = []
  const seen = new Set<string>()

  for (const node of walk(parseDocument(html).children)) {
    if (dataQa(node) !== CARD_QA) {
      continue
    }

    const card = parseCard(node)
    if (card && !seen.has(card.hhId)) {
      seen.add(card.hhId)
      cards.push(card)
    }
  }

  return cards
}
