import { prisma } from '../server/utils/db'
import { saveScoreThreshold, scoreAllVacancies } from '../server/services/scorer'

/**
 * Скоринг вакансий из локальной базы: объяснимая оценка по портрету.
 * `--threshold N` меняет порог отсечения в настройках и сразу пересчитывает оценки.
 */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
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

  const top = await prisma.score.findMany({
    where: { passed: true },
    orderBy: { total: 'desc' },
    take: 5,
    include: { vacancy: { select: { title: true, company: true } } },
  })

  for (const row of top) {
    console.log(`- ${row.total}: ${row.vacancy.title} — ${row.vacancy.company}`)
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
