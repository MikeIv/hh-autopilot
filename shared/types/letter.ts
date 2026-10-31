import type { LetterVariant } from './domain'

/** Вакансия, по которой собирается письмо: из карточки выдачи бывает и без описания. */
export interface LetterVacancy {
  title: string
  company: string
  description: string | null
}

/** Черновик письма: вариант, текст и длина — под поле отклика hh. */
export interface LetterDraft {
  variant: LetterVariant
  body: string
  charCount: number
}
