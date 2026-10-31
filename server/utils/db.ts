import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

/**
 * Локальная база по умолчанию. Путь абсолютный: у собранного сервера относительный
 * адрес считается от каталога сборки, и SQLite не находит файл. `.env` перекрывает
 * это значение, когда он загружен (`pnpm dev`, `pnpm preview`).
 */
const DEFAULT_DATABASE_URL = `file:${join(process.cwd(), 'data', 'hh-autopilot.db').replaceAll('\\', '/')}`

/** Один клиент Prisma на процесс: в dev Nuxt пересоздаёт модули при HMR. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl } } })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
