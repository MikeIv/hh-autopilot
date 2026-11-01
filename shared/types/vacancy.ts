/** Валюта, к которой нормализуются зарплаты: как в портрете кандидата. */
export type Currency = 'RUR' | 'USD' | 'EUR'

/** Вакансия, разобранная из выдачи hh: только то, что видно в карточке списка. */
export interface VacancyCard {
  hhId: string
  title: string
  company: string
  url: string
  /** Страница работодателя на hh. `null`, если в карточке нет ссылки `/employer/`. */
  employerUrl: string | null
  /** Галочка «Проверенный» рядом с названием. */
  employerTrusted: boolean
  /** Оценка отзывов, как её показывает hh: «4.2». */
  employerRating: string | null
  /** Подпись к оценке: «10 отзывов». */
  employerReviews: string | null
  /** Значок рейтинга работодателей hh. */
  employerHhRating: boolean
  /** Значок победителя HR-бренда. */
  employerHrBrand: boolean
  /** Логотип с карточки выдачи. */
  employerLogo: string | null
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
