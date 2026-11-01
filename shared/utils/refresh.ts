import type { RefreshResult } from '../types/refresh'

/** Короткая фраза для очереди: сколько карточек пришло и сколько прошли порог. */
export function formatRefreshResult(result: RefreshResult): string {
  return `Выдача hh обновлена: найдено ${result.found}, новых ${result.created}, изменено ${result.updated}. Прошли порог: ${result.passed}.`
}
