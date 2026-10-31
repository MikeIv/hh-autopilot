import { prisma } from '../server/utils/db'
import { generateLetters } from '../server/services/letter'

/**
 * Письма для вакансий, прошедших порог: текст собирается из резюме.
 * Ничего не отправляет — отклики ждут человека в очереди ревью.
 */
async function main(): Promise<void> {
  const stats = await generateLetters(prisma)
  const variants = Object.entries(stats.variants)
    .filter(([, count]) => count > 0)
    .map(([variant, count]) => `${variant}: ${count}`)
    .join(' · ')

  console.log(`Писем: ${stats.generated}${variants ? ` (${variants})` : ''}`)

  const sample = await prisma.letter.findFirst({
    include: { vacancy: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
  })

  if (sample) {
    console.log(`Пример — «${sample.vacancy.title}», вариант ${sample.variant}:`)
    console.log(sample.body)
    console.log(`Длина: ${sample.charCount}`)
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
