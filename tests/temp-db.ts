import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

/** CLI Prisma запускается тем же Node, без shell: так работает и на Windows. */
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')

/**
 * Временная база с миграциями: тесты не трогают рабочую `data/hh-autopilot.db`.
 * Имя файла включает pid — файлы тестов не мешают друг другу.
 */
export async function openTempDatabase(prefix: string): Promise<{
  client: PrismaClient
  close: () => Promise<void>
}> {
  const file = join(process.cwd(), 'data', `${prefix}-${process.pid}.db`)
  const url = `file:../data/${prefix}-${process.pid}.db`

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const client = new PrismaClient({ datasources: { db: { url } } })

  return {
    client,
    close: async () => {
      await client.$disconnect()
      await rm(file, { force: true })
      await rm(`${file}-journal`, { force: true })
    },
  }
}
