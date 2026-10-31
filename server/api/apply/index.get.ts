import { readApplyStatus } from '../../services/apply'

/** Состояние отправки для UI: окно, лимит, panic и последний прогон. */
export default defineEventHandler(() => readApplyStatus())
