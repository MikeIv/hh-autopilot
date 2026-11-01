import { afterEach, describe, expect, it } from 'vitest'
import { HhBlockedError } from '../server/utils/hh-session'
import {
  RefreshError,
  isRefreshRunning,
  readRefreshStatus,
  resetRefreshState,
  startRefresh,
  waitForRefresh,
} from '../server/services/refresh'
import { formatRefreshResult } from '../shared/utils/refresh'
import type { CollectStats } from '../server/services/collector'
import type { LetterStats } from '../server/services/letter'
import type { ScoreStats } from '../server/services/scorer'

const collected: CollectStats = {
  queries: ['Nuxt разработчик'],
  found: 10,
  created: 2,
  updated: 1,
  unchanged: 7,
}

const scored: ScoreStats = { scored: 12, passed: 4, failed: 8, threshold: 65 }
const letters: LetterStats = {
  generated: 4,
  kept: 0,
  variants: { product: 4, outstaff: 0, service: 0 },
}

describe('обновление выдачи', () => {
  afterEach(() => {
    resetRefreshState()
  })

  it('собирает выдачу, затем оценивает и пишет письма', async () => {
    const order: string[] = []

    await startRefresh({
      applyRunning: async () => false,
      collect: async () => {
        order.push('collect')
        return collected
      },
      score: async () => {
        order.push('score')
        return scored
      },
      letters: async () => {
        order.push('letters')
        return letters
      },
    })
    await waitForRefresh()

    expect(order).toEqual(['collect', 'score', 'letters'])
    expect(readRefreshStatus().running).toBe(false)
    expect(readRefreshStatus().result).toMatchObject({
      found: 10,
      created: 2,
      updated: 1,
      passed: 4,
      letters: 4,
    })
    const result = readRefreshStatus().result
    expect(result).not.toBeNull()
    if (result) {
      expect(formatRefreshResult(result)).toBe(
        'Выдача hh обновлена: найдено 10, новых 2, изменено 1. Прошли порог: 4.',
      )
    }
  })

  it('не запускает второй сбор, пока идёт первый', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await startRefresh({
      applyRunning: async () => false,
      collect: () => gate.then(() => collected),
      score: async () => scored,
      letters: async () => letters,
    })

    expect(isRefreshRunning()).toBe(true)
    await expect(
      startRefresh({
        collect: async () => {
          throw new Error('второй сбор не должен стартовать')
        },
      }),
    ).rejects.toBeInstanceOf(RefreshError)

    release?.()
    await waitForRefresh()
  })

  it('не открывает hh, пока идёт отправка откликов', async () => {
    let collectedTimes = 0

    await expect(
      startRefresh({
        applyRunning: async () => true,
        collect: async () => {
          collectedTimes += 1
          return collected
        },
      }),
    ).rejects.toThrow(/браузер hh занят/)

    expect(collectedTimes).toBe(0)
    expect(isRefreshRunning()).toBe(false)
  })

  it('снимает флаг, если проверка отправки упала', async () => {
    await expect(
      startRefresh({
        applyRunning: async () => {
          throw new Error('база недоступна')
        },
        collect: async () => collected,
      }),
    ).rejects.toThrow(/база недоступна/)

    expect(isRefreshRunning()).toBe(false)
    expect(readRefreshStatus().error).toContain('база недоступна')
  })

  it('сохраняет понятную ошибку, если hh просит человека', async () => {
    await startRefresh({
      applyRunning: async () => false,
      collect: async () => {
        throw new HhBlockedError('captcha', 'капча')
      },
      score: async () => scored,
      letters: async () => letters,
    })
    await waitForRefresh()

    expect(readRefreshStatus().running).toBe(false)
    expect(readRefreshStatus().error).toContain('капчу')
    expect(readRefreshStatus().result).toBeNull()
  })
})
