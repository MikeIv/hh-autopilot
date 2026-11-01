import './env'
import { prisma } from '../server/utils/db'
import { saveScoreThreshold, scoreAllVacancies } from '../server/services/scorer'
import { compareNuxtStackFirst, nuxtStackLabels } from '../shared/utils/scorer'
import type { ScoreCriterion } from '../shared/types/score'

/**
 * Скоринг вакансий из локальной базы: объяснимая оценка по портрету.
 * `--threshold N` меняет порог отсечения в настройках и сразу пересчитывает оценки.
 */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** Критерии из базы: строка JSON, писалась только скорером. */
function parseCriteria(raw: string): ScoreCriterion[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ScoreCriterion[]) : []
  } catch {
    return []
  }
}

async function main(): Promise<void> {
  const rawThreshold = flag('--threshold')
  if (rawThreshold !== undefined) {
    const value = Number(rawThreshold)
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error(`--threshold — целое число от 0 до 100, получено: ${rawThreshold}`)
    }
    await saveScoreThreshold(value)
    console.log(`Порог отсечения: ${value}`)
  }

  const stats = await scoreAllVacancies(prisma)
  console.log(
    `Порог: ${stats.threshold} · оценено: ${stats.scored} · прошли: ${stats.passed} · отсеяно: ${stats.failed}`,
  )

  const passed = await prisma.score.findMany({
    where: { passed: true },
    include: { vacancy: { select: { title: true, company: true } } },
  })

  const top = passed
    .map((row) => ({
      total: row.total,
      nuxtStack: nuxtStackLabels(parseCriteria(row.criteria)),
      title: row.vacancy.title,
      company: row.vacancy.company,
    }))
    .sort(compareNuxtStackFirst)
    .slice(0, 5)

  for (const row of top) {
    const stack = row.nuxtStack.length ? ` · Nuxt: ${row.nuxtStack.join(', ')}` : ''
    console.log(`- ${row.total}${stack}: ${row.title} — ${row.company}`)
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
