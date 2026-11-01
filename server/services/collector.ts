import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import { launchHhContext, openHhPage } from '../utils/hh-session'
import { buildSearchUrl, searchQueries } from '../../shared/utils/hh-search'
import { parseSerpPage } from '../../shared/utils/serp'
import type { CandidatePortrait } from '../../shared/types/portrait'
import type { VacancyCard } from '../../shared/types/vacancy'

/** Пауза между страницами выдачи: инструмент читает hh спокойно, как человек. */
const PAGE_DELAY_MS = 3000

export interface CollectOptions {
  /** Сколько страниц выдачи брать на запрос; первая — 0. */
  pages?: number
  /** Перекрыть запросы из портрета: нужен для отладки и повторного прогона. */
  queries?: readonly string[]
}

export interface SaveStats {
  created: number
  updated: number
  unchanged: number
}

export interface CollectStats extends SaveStats {
  queries: readonly string[]
  found: number
}

/**
 * Отпечаток карточки: работодатель правит вакансию — меняется хеш, и повторный
 * сбор видит правку. Запрос, которым вакансия найдена, в отпечаток не входит.
 */
function rawHash(card: VacancyCard): string {
  const fields = [
    card.title,
    card.company,
    card.salaryFrom,
    card.salaryTo,
    card.currency,
    card.schedule,
    card.experience,
    card.area,
    card.employerUrl,
    card.employerTrusted,
    card.employerRating,
    card.employerReviews,
    card.employerHhRating,
    card.employerHrBrand,
    card.employerLogo,
  ]
  return createHash('sha1').update(fields.join('|')).digest('hex')
}

/** Кладёт карточки в базу без дублей: `hhId` уникален, изменённые вакансии обновляются. */
export async function saveCards(
  cards: readonly VacancyCard[],
  source: string,
  client: PrismaClient = prisma,
): Promise<SaveStats> {
  const stats: SaveStats = { created: 0, updated: 0, unchanged: 0 }

  for (const card of cards) {
    const hash = rawHash(card)
    const existing = await client.vacancy.findUnique({
      where: { hhId: card.hhId },
      select: { rawHash: true },
    })

    if (!existing) {
      await client.vacancy.create({ data: { ...card, source, rawHash: hash } })
      stats.created += 1
      continue
    }

    if (existing.rawHash === hash) {
      stats.unchanged += 1
      continue
    }

    await client.vacancy.update({
      where: { hhId: card.hhId },
      data: { ...card, source, rawHash: hash },
    })
    stats.updated += 1
  }

  return stats
}

/**
 * Собирает выдачу hh по запросам из портрета и складывает её в локальную базу.
 * Капча или истёкшая сессия — `HhBlockedError`: сбор прекращается, дальше нужен человек.
 */
export async function collectPortrait(
  portrait: CandidatePortrait,
  options: CollectOptions = {},
): Promise<CollectStats> {
  const queries = options.queries ?? searchQueries(portrait)
  const pages = Math.max(1, options.pages ?? 1)
  const stats: CollectStats = {
    queries,
    found: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
  }

  const context = await launchHhContext()

  try {
    let first = true
    for (const query of queries) {
      for (let page = 0; page < pages; page += 1) {
        if (!first) {
          await sleep(PAGE_DELAY_MS)
        }
        first = false

        const { html } = await openHhPage(context, buildSearchUrl(portrait, query, page))
        const cards = parseSerpPage(html)
        const saved = await saveCards(cards, query)

        stats.found += cards.length
        stats.created += saved.created
        stats.updated += saved.updated
        stats.unchanged += saved.unchanged
      }
    }
  } finally {
    await context.close()
  }

  return stats
}
