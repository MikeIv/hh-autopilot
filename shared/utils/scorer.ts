import type { CandidatePortrait } from '../types/portrait'
import type { CriterionKey, ScorableVacancy, ScoreCriterion, ScoreResult } from '../types/score'

/** Веса критериев: решение из PROJECT.md, сумма — 100. */
export const SCORING_WEIGHTS = {
  stack: 35,
  role: 25,
  format: 15,
  experience: 15,
  salary: 10,
} as const satisfies Record<CriterionKey, number>

/** Порог отсечения по умолчанию; перекрывается настройкой `score.threshold`. */
export const DEFAULT_SCORE_THRESHOLD = 65

/** Полный балл за стек — три совпавшие технологии; одна-две — ещё не тот стек. */
const STACK_MATCHES_FOR_FULL = 3

/** Слова-маркеры роли: по ним видно, что вакансия про разработку, а не про что-то рядом. */
const ROLE_WORDS = ['разработчик', 'developer', 'программист', 'инженер', 'engineer']

/** Признаки именно веб-работы в раннем опыте: по ним считается начало стажа. */
const WEB_WORK = /веб|javascript|фриланс|сайт/iu

/** Служебные слова: они не должны подтверждать совпадение домена. */
const STOP_WORDS = new Set([
  'который',
  'которая',
  'чтобы',
  'более',
  'между',
  'перед',
  'через',
  'стоит',
  'живут',
  'очень',
  'место',
  'одном',
  'команда',
  'людей',
  'задачи',
])

/** Формат hh → формат портрета. Неизвестное значение не подтверждает формат. */
const HH_SCHEDULE_FORMAT: Record<string, 'remote' | 'hybrid' | 'office'> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'office',
  office: 'office',
  full: 'office',
}

/** Минимальный стаж, который стоит за маркировкой опыта hh. */
const EXPERIENCE_REQUIREMENTS: Record<string, number> = {
  noExperience: 0,
  '1-3': 1,
  '3-6': 3,
  '6+': 6,
}

/** Текст без мусора: нижний регистр, пунктуация — в пробелы, лишние пробелы схлопнуты. */
function flatText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#./]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Технология из ключевых навыков без версии и пояснения: «Nuxt 4» → `nuxt`. */
function normalizeTech(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/@/g, '')
    .replace(/\.js\b/g, '')
    .replace(/\s+\d+(?:\.\d+)?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Технологии портрета: ключевые навыки hh, нормализованные и без повторов. */
export function techTerms(portrait: CandidatePortrait): string[] {
  return [...new Set(portrait.hh.keywords.map(normalizeTech).filter((term) => term.length > 1))]
}

/** Встречается ли термин в тексте как отдельное слово, с учётом дефисов и пробелов. */
function mentions(text: string, term: string): boolean {
  const pattern = term
    .split(/[\s-]+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s-]+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'u').test(text)
}

/** Слова роли и профиля из заголовка резюме: «Nuxt fullstack разработчик» → роль и профиль. */
function roleWords(portrait: CandidatePortrait): { role: string[]; profile: string[] } {
  // Скобки заголовка — версии и уточнения стека, к роли они не относятся.
  const label = flatText(portrait.basics.label.replace(/\(.*?\)/g, ' '))
  const tech = new Set(techTerms(portrait))
  const role = ROLE_WORDS.filter((word) => mentions(label, word))
  const profile = label
    .split(' ')
    .filter(
      (word) => word.length > 2 && !/^\d+$/.test(word) && !role.includes(word) && !tech.has(word),
    )
  return { role, profile }
}

/** Слова домена из пожеланий портрета: из них собирается критерий «роль и домен». */
function domainTerms(portrait: CandidatePortrait): string[] {
  const text = `${portrait.hh.portrait.domain} ${portrait.hh.portrait.product}`
  return [
    ...new Set(
      flatText(text)
        .split(' ')
        .filter((word) => word.length >= 5 && !STOP_WORDS.has(word)),
    ),
  ]
}

/** Год начала веб-опыта: самый ранний «веб»-период раннего опыта, иначе — блок опыта. */
export function experienceStartYear(portrait: CandidatePortrait): number {
  const early = (portrait.earlyExperience ?? [])
    .filter((item) => WEB_WORK.test(item.text))
    .map((item) => Number.parseInt(item.period, 10))
    .filter((year) => Number.isInteger(year) && year > 1990)

  const recent = portrait.experience
    .map((job) => Number.parseInt(job.from.slice(0, 4), 10))
    .filter((year) => Number.isInteger(year))

  return Math.min(...early, ...recent)
}

/** Стаж в годах: от начала веб-опыта до сегодняшнего года. */
export function candidateExperienceYears(portrait: CandidatePortrait, now = new Date()): number {
  return Math.max(0, now.getFullYear() - experienceStartYear(portrait))
}

/** Стек: сколько технологий портрета встретилось в вакансии; полный балл — с трёх. */
function scoreStack(portrait: CandidatePortrait, text: string, weight: number): ScoreCriterion {
  const matched = techTerms(portrait).filter((term) => mentions(text, term))
  const earned = Math.round(
    (weight * Math.min(matched.length, STACK_MATCHES_FOR_FULL)) / STACK_MATCHES_FOR_FULL,
  )
  const shown = matched.slice(0, 5).join(', ')

  return {
    key: 'stack',
    weight,
    earned,
    reason: matched.length
      ? `совпали технологии: ${shown}${matched.length > 5 ? ' и другие' : ''} (${matched.length} из ${STACK_MATCHES_FOR_FULL} для полного балла)`
      : 'ни одна технология портрета в вакансии не встретилась',
  }
}

/** Роль и домен: слово роли и профиль в заголовке, домен — только при наличии описания. */
function scoreRole(
  portrait: CandidatePortrait,
  vacancy: ScorableVacancy,
  weight: number,
): ScoreCriterion {
  const title = flatText(vacancy.title)
  const { role, profile } = roleWords(portrait)
  const hasRole = role.some((word) => mentions(title, word))
  const hasProfile = profile.some((word) => mentions(title, word))
  const roleFit = hasRole ? (hasProfile ? 1 : 0.5) : 0

  const description = vacancy.description ? flatText(vacancy.description) : null
  const matchedDomain = description
    ? domainTerms(portrait).filter((term) => mentions(description, term))
    : []
  const domainFit = description ? Math.min(matchedDomain.length, 2) / 2 : 0
  const earned = Math.round(weight * Math.min(1, 0.6 * roleFit + 0.4 * domainFit))

  const reasons: string[] = []
  if (!hasRole) {
    reasons.push('в заголовке нет слова роли')
  } else {
    reasons.push(
      hasProfile
        ? `заголовок совпал с профилем (${profile.join(', ')})`
        : 'слово роли есть, профиль не подтверждён',
    )
  }
  reasons.push(
    description
      ? `домен: ${matchedDomain.length ? matchedDomain.slice(0, 3).join(', ') : 'совпадений нет'}`
      : 'описания нет — домен не проверен',
  )

  return { key: 'role', weight, earned, reason: reasons.join('; ') }
}

/** Формат и занятость: формат сверяется с пожеланиями, занятость пока неизвестна. */
function scoreFormat(
  portrait: CandidatePortrait,
  vacancy: ScorableVacancy,
  weight: number,
): ScoreCriterion {
  const allowed = portrait.basics.formats
  const known = vacancy.schedule ? HH_SCHEDULE_FORMAT[vacancy.schedule] : undefined

  if (!known) {
    return {
      key: 'format',
      weight,
      earned: Math.round(weight * 0.5),
      reason: 'формат в вакансии не указан — считаем неизвестным, половина веса',
    }
  }

  const fits = (allowed as readonly string[]).includes(known)
  return {
    key: 'format',
    weight,
    earned: fits ? weight : 0,
    reason: fits
      ? `формат «${known}» входит в пожелания (${allowed.join(', ')}); занятость в карточке не указана`
      : `формат «${known}» не входит в пожелания (${allowed.join(', ')})`,
  }
}

/** Опыт: требуемый стаж против стажа из резюме; неизвестное требование — половина веса. */
function scoreExperience(
  portrait: CandidatePortrait,
  vacancy: ScorableVacancy,
  weight: number,
): ScoreCriterion {
  const requirement = vacancy.experience ? EXPERIENCE_REQUIREMENTS[vacancy.experience] : undefined
  const years = candidateExperienceYears(portrait)

  if (requirement === undefined) {
    return {
      key: 'experience',
      weight,
      earned: Math.round(weight * 0.5),
      reason: 'требуемый опыт в вакансии не указан — считаем неизвестным, половина веса',
    }
  }

  if (requirement === 0) {
    return { key: 'experience', weight, earned: weight, reason: 'опыт не требуется' }
  }

  const earned = Math.round(weight * Math.min(1, years / requirement))
  return {
    key: 'experience',
    weight,
    earned,
    reason: `нужно от ${requirement} лет, в резюме около ${years} лет`,
  }
}

/** Зарплата: верх вилки против пожелания; неизвестная зарплата — не провал, половина веса. */
function scoreSalary(
  portrait: CandidatePortrait,
  vacancy: ScorableVacancy,
  weight: number,
): ScoreCriterion {
  const top = vacancy.salaryTo ?? vacancy.salaryFrom
  if (top === null) {
    return {
      key: 'salary',
      weight,
      earned: Math.round(weight * 0.5),
      reason: 'зарплата не указана — считаем неизвестной, половина веса',
    }
  }

  const wanted = portrait.basics.salary
  if (vacancy.currency && vacancy.currency !== wanted.currency) {
    return {
      key: 'salary',
      weight,
      earned: Math.round(weight * 0.5),
      reason: `валюта вакансии ${vacancy.currency} не сравнивается с ${wanted.currency} без курса`,
    }
  }

  return {
    key: 'salary',
    weight,
    earned: Math.round(weight * Math.min(1, top / wanted.amount)),
    reason: `верх вилки ${top} ${wanted.currency} против пожелания ${wanted.amount}`,
  }
}

/** Объяснимая оценка вакансии: сумма вклада критериев, порог отсечения и причины. */
export function scoreVacancy(
  portrait: CandidatePortrait,
  vacancy: ScorableVacancy,
  threshold = DEFAULT_SCORE_THRESHOLD,
): ScoreResult {
  const text = flatText([vacancy.title, vacancy.description ?? ''].join(' '))
  const criteria = [
    scoreStack(portrait, text, SCORING_WEIGHTS.stack),
    scoreRole(portrait, vacancy, SCORING_WEIGHTS.role),
    scoreFormat(portrait, vacancy, SCORING_WEIGHTS.format),
    scoreExperience(portrait, vacancy, SCORING_WEIGHTS.experience),
    scoreSalary(portrait, vacancy, SCORING_WEIGHTS.salary),
  ]
  const total = criteria.reduce((sum, criterion) => sum + criterion.earned, 0)

  return { total, threshold, passed: total >= threshold, criteria }
}
