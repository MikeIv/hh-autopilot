import './env'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

/**
 * Разворачивает схему одной командой: удаляет локальную базу и накатывает миграции.
 * Сессию hh и настройки не трогает — они лежат вне базы.
 */
const DATA_DIR = join(process.cwd(), 'data')
const DB_FILE = join(DATA_DIR, 'hh-autopilot.db')
/** CLI Prisma запускается тем же Node, без shell: так работает и на Windows. */
const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js')
const run = promisify(execFile)

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await rm(DB_FILE, { force: true })
  await rm(`${DB_FILE}-journal`, { force: true })
  await rm(`${DB_FILE}-wal`, { force: true })
  await rm(`${DB_FILE}-shm`, { force: true })
  console.log('База удалена, накатываю миграции…')

  const { stdout } = await run(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'])
  console.log(stdout.trim())
  console.log(`Схема развёрнута: ${DB_FILE}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
