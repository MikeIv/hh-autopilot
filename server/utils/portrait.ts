import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { CandidatePortrait } from '../../shared/types/portrait'
import { parsePortrait } from '../../shared/utils/portrait'

/**
 * Портрет читается из единственного источника правды — `data/resume.yaml`
 * соседнего пакета `resume-site`. Путь абсолютный: у собранного сервера
 * относительный адрес считается от каталога сборки, и файл не находится.
 */
export const DEFAULT_RESUME_PATH = resolve(
  process.cwd(),
  '..',
  'resume-site',
  'data',
  'resume.yaml',
)

/** `RESUME_PATH` перекрывает путь по умолчанию; относительный путь — от корня проекта. */
export function resolveResumePath(path = process.env.RESUME_PATH): string {
  if (!path) {
    return DEFAULT_RESUME_PATH
  }
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

/** Кэш по пути: смоук и тесты могут подменить `RESUME_PATH` в одном процессе. */
let cache: { file: string; portrait: CandidatePortrait } | null = null

async function readPortraitFile(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Не удалось прочитать портрет из ${file}: ${reason}. ` +
        'Путь задаётся переменной RESUME_PATH, по умолчанию — ../resume-site/data/resume.yaml.',
      { cause: error },
    )
  }
}

/** Читает и валидирует портрет один раз на путь, остальным вызовам отдаёт кэш. */
export async function loadPortrait(): Promise<CandidatePortrait> {
  const file = resolveResumePath()
  if (cache?.file === file) {
    return cache.portrait
  }

  const portrait = parsePortrait(await readPortraitFile(file))
  cache = { file, portrait }
  return portrait
}
