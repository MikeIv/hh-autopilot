import { readRefreshStatus } from '../../services/refresh'

/** Состояние обновления выдачи: идёт ли сбор и чем закончился прошлый. */
export default defineEventHandler(() => readRefreshStatus())
