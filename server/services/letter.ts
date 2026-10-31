import type { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/db'
import { loadPortrait } from '../utils/portrait'
import { recommendedLetter } from '../../shared/utils/letter'
import type { LetterVariant } from '../../shared/types/domain'

export interface LetterStats {
  generated: number
  /** Письма, у которых человек уже выбрал вариант: их генератор не трогает. */
  kept: number
  variants: Record<LetterVariant, number>
}

/**
 * Пишет письмо для вакансий, прошедших порог, и обновляет его при повторном прогоне.
 * Одно письмо на вакансию; вариант, выбранный человеком, остаётся его выбором.
 */
export async function generateLetters(client: PrismaClient = prisma): Promise<LetterStats> {
  const portrait = await loadPortrait()
  const scores = await client.score.findMany({
    where: { passed: true },
    include: { vacancy: { include: { letter: true } } },
  })

  const variants: Record<LetterVariant, number> = { product: 0, outstaff: 0, service: 0 }
  let kept = 0

  for (const score of scores) {
    const vacancy = score.vacancy
    if (vacancy.letter?.selectedAt) {
      kept += 1
      continue
    }

    const draft = recommendedLetter(portrait, {
      title: vacancy.title,
      company: vacancy.company,
      description: vacancy.description,
    })

    await client.letter.upsert({
      where: { vacancyId: vacancy.id },
      create: {
        vacancyId: vacancy.id,
        variant: draft.variant,
        body: draft.body,
        charCount: draft.charCount,
      },
      update: { variant: draft.variant, body: draft.body, charCount: draft.charCount },
    })

    variants[draft.variant] += 1
  }

  return { generated: scores.length - kept, kept, variants }
}
