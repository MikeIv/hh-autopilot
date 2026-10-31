import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Портрет для тестов. Локально берётся настоящее `resume.yaml` соседнего пакета,
 * в публичном клоне — пример той же формы из `data/resume.example.yaml`.
 * Явный RESUME_PATH из окружения всегда главнее.
 */
const realResume = join(process.cwd(), '..', 'resume-site', 'data', 'resume.yaml')

if (!process.env.RESUME_PATH && !existsSync(realResume)) {
  process.env.RESUME_PATH = join(process.cwd(), 'data', 'resume.example.yaml')
}
