import type { CandidatePortrait, WorkFormat } from '../types/portrait'

/** Поиск вакансий hh: только чтение выдачи, без внутренних эндпоинтов. */
export const HH_SEARCH_URL = 'https://hh.ru/search/vacancy'

/** hh принимает своё имя формата: в портрете он наш, в запросе — площадки. */
const HH_WORK_FORMAT: Record<WorkFormat, string> = {
  remote: 'REMOTE',
  hybrid: 'HYBRID',
  office: 'ON_SITE',
}

/** Город из портрета → регион hh. Неизвестный город — ошибка: молча искать не там хуже. */
const HH_AREAS: Record<string, string> = {
  Москва: '1',
}

/** Форматы из портрета одной строкой: hh ждёт их через запятую. */
export function hhWorkFormats(formats: readonly WorkFormat[]): string {
  return formats.map((format) => HH_WORK_FORMAT[format]).join(',')
}

/** Регион hh по городу портрета. */
export function hhArea(city: string): string {
  const area = HH_AREAS[city]
  if (!area) {
    throw new Error(
      `Нет id региона hh для «${city}»: добавь его в HH_AREAS в shared/utils/hh-search.ts`,
    )
  }
  return area
}

/** Слово роли в запросе: без него hh ищет по любому упоминанию специальности. */
const ROLE_WORD = /(разработчик|программист|инженер|developer|engineer)/i

/**
 * Заголовок резюме → запросы: «Frontend / Nuxt fullstack разработчик» — это две
 * роли, а не одна строка, которую hh не найдёт. Одна специальность без слова
 * роли («Frontend») дополняется до «Frontend разработчик».
 */
function labelQueries(label: string): string[] {
  return label
    .replace(/\s*\([^)]*\)$/, '')
    .trim()
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (ROLE_WORD.test(part) ? part : `${part} разработчик`))
}

/**
 * Роли для поиска: заголовок резюме без скобок и технологии из ключевых навыков.
 * Список запросов — не отдельный источник правды: он выводится из портрета.
 */
export function searchQueries(portrait: CandidatePortrait, limit = 4): string[] {
  const roles: ReadonlyArray<readonly [string, string]> = [
    ['Nuxt', 'Nuxt разработчик'],
    ['Vue', 'Vue разработчик'],
    ['TypeScript', 'TypeScript fullstack разработчик'],
  ]

  const keywords = portrait.hh.keywords.map((keyword) => keyword.toLowerCase())
  const queries = roles
    .filter(([tech]) => keywords.some((keyword) => keyword.startsWith(tech.toLowerCase())))
    .map(([, query]) => query)

  return [...new Set([...labelQueries(portrait.basics.label), ...queries])].slice(0, limit)
}

/** Адрес выдачи hh: запрос, регион и форматы — из портрета, страница — из аргумента. */
export function buildSearchUrl(portrait: CandidatePortrait, query: string, page = 0): string {
  const url = new URL(HH_SEARCH_URL)
  url.searchParams.set('text', query)
  url.searchParams.set('area', hhArea(portrait.basics.location.city))
  url.searchParams.set('work_format', hhWorkFormats(portrait.basics.formats))
  url.searchParams.set('items_on_page', '50')
  url.searchParams.set('page', String(page))
  return url.toString()
}
