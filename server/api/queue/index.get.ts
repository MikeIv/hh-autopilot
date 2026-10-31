import { readQueue } from '../../services/queue'

/** Очередь ревью для UI: оценка, письмо и статус каждого отклика. */
export default defineEventHandler(() => readQueue())
