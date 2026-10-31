import { prisma } from '../server/utils/db'
import { ApplyError, runApply } from '../server/services/apply'
import type { ApplyResult } from '../shared/types/apply'
import { DAILY_APPLICATION_LIMIT } from '../shared/types/queue'

/**
 * Отправка одобренных откликов на hh. Без HH_AUTO_APPLY и без --dry-run
 * всё равно работает сухим прогоном: печатает, что и куда отправил бы.
 */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > DAILY_APPLICATION_LIMIT) {
    throw new Error(`--limit — целое число от 1 до ${DAILY_APPLICATION_LIMIT}, получено: ${raw}`)
  }
  return value
}

function printResult(result: ApplyResult): void {
  console.log(result.message)

  if (result.mode === 'dry') {
    for (const target of result.planned) {
      console.log(`- «${target.title}» — ${target.company}`)
      console.log(`  ${target.url} · вариант ${target.variant} · ${target.charCount} знаков`)
      for (const line of target.body.split('\n')) {
        console.log(`  ${line}`)
      }
    }
  }

  for (const skip of result.skips) {
    console.log(`Пропуск: «${skip.title}» — ${skip.message}`)
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const limit = parseLimit(flag('--limit'))
  const autoApplyEnabled = process.env.HH_AUTO_APPLY === 'true'

  if (!dryRun && !autoApplyEnabled) {
    console.log('HH_AUTO_APPLY выключен — живой отправки не будет, только сухой прогон.')
  }

  const result = await runApply({ dryRun, limit, autoApplyEnabled })
  printResult(result)

  if (result.stopped === 'blocked') {
    process.exitCode = 2
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof ApplyError) {
      console.error(error.message)
    } else {
      console.error(error)
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
