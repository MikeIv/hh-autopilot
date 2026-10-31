/** Валюта, к которой нормализуются зарплаты: как в портрете кандидата. */
export type Currency = 'RUR' | 'USD' | 'EUR'

/** Вакансия, разобранная из выдачи hh: только то, что видно в карточке списка. */
export interface VacancyCard {
  hhId: string
  title: string
  company: string
  url: string
  area: string | null
  salaryFrom: number | null
  salaryTo: number | null
  /** `null` — работодатель не указал зарплату. */
  currency: Currency | null
  /** Формат работы из метки hh (`remote`, `onsite`…); `null` — метки нет. */
  schedule: string | null
  /** Требуемый опыт в обозначениях hh: `1-3`, `3-6`, `6+`. */
  experience: string | null
}
