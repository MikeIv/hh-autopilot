import { parse } from 'yaml'
import { candidatePortraitSchema } from '../schema/portrait'
import type { CandidatePortrait } from '../types/portrait'

/**
 * Разбирает `resume.yaml` и валидирует блоки портрета. Проекты, образование и SEO
 * сюда не попадают: портрет — подмножество источника правды, а не его копия.
 */
export function parsePortrait(raw: string): CandidatePortrait {
  const data: unknown = parse(raw)
  return candidatePortraitSchema.parse(data)
}
