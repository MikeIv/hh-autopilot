import './env'
import { prisma } from '../server/utils/db'
import { loadPortrait } from '../server/utils/portrait'
import { collectPortrait } from '../server/services/collector'
import { HhBlockedError } from '../server/utils/hh-session'

/**
 * Сухой сбор: читает выдачу hh по запросам из портрета и складывает вакансии в базу.
 * Ничего не отправляет. Капча или истёкшая сессия — стоп и просьба человеку.
 */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** `--query` можно повторять: так прогон можно сузить до одного запроса. */
function repeated(name: string): string[] {
  const values: string[] = []
  process.argv.forEach((argument, index) => {
    const value = process.argv[index + 1]
    if (argument === name && value) {
      values.push(value)
    }
  })
  return values
}

async function main(): Promise<void> {
  const rawPages = flag('--pages')
  const pages = rawPages ? Number(rawPages) : 1
  if (!Number.isInteger(pages) || pages < 1) {
    throw new Error(`--pages должно быть положительным числом, получено: ${rawPages}`)
  }

  const queries = repeated('--query')
  const portrait = await loadPortrait()

  console.log(`Страниц на запрос: ${pages}`)
  console.log(queries.length ? `Запросы: ${queries.join(' · ')}` : 'Запросы: из портрета')

  const stats = await collectPortrait(portrait, {
    pages,
    queries: queries.length ? queries : undefined,
  })

  console.log(`Готово. Запросы: ${stats.queries.join(' · ')}`)
  console.log(
    `Карточек: ${stats.found} · новых: ${stats.created} · обновлено: ${stats.updated} · без изменений: ${stats.unchanged}`,
  )
  console.log(`Всего в базе: ${await prisma.vacancy.count()}`)
}

main()
  .catch(async (error: unknown) => {
    if (error instanceof HhBlockedError) {
      console.error(`Остановка (${error.reason}): ${error.message}`)
      console.error('Дальше нужен человек: войдите на hh.ru и запустите сбор заново.')
    } else {
      console.error(error)
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
