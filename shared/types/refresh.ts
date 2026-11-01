/** Итог обновления выдачи: что пришло с hh и что после этого прошло порог. */
export interface RefreshResult {
  queries: string[]
  found: number
  created: number
  updated: number
  unchanged: number
  scored: number
  passed: number
  letters: number
}

/** Состояние обновления для кнопки в очереди. Прогон идёт на сервере, страница его опрашивает. */
export interface RefreshStatus {
  running: boolean
  error: string | null
  result: RefreshResult | null
  finishedAt: string | null
}
