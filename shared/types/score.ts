/** Критерий оценки соответствия вакансии портрету. */
export type CriterionKey = 'stack' | 'role' | 'format' | 'experience' | 'salary'

/** Вклад одного критерия: вес, заработанные баллы и объяснение «почему столько». */
export interface ScoreCriterion {
  key: CriterionKey
  weight: number
  earned: number
  /** Что совпало или чего не хватило — это читает человек в очереди ревью. */
  reason: string
}

/** Итог скоринга вакансии: сумма, порог отсечения и вклад каждого критерия. */
export interface ScoreResult {
  total: number
  threshold: number
  passed: boolean
  criteria: ScoreCriterion[]
}

/** Что скореру нужно от вакансии: поля карточки выдачи плюс необязательное описание. */
export interface ScorableVacancy {
  title: string
  /** Появляется, только когда вакансию открывают целиком; из выдачи пусто. */
  description: string | null
  salaryFrom: number | null
  salaryTo: number | null
  currency: string | null
  schedule: string | null
  employment: string | null
  experience: string | null
}
