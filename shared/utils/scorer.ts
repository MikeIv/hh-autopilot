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

/**
 * Ядро стека Nuxt и вес в выдаче. Nuxt поднимает карточку сильнее, чем Vue или
 * Nitro; TypeScript и Vite встречаются и в чужих стеках, поэтому порядок не двигают.
 */
const NUXT_STACK_LABELS: ReadonlyArray<readonly [string, string, number]> = [
  ['nuxt', 'Nuxt', 10],
  ['nuxt ui', 'Nuxt UI', 10],
  ['nuxi', 'Nuxi', 10],
  ['vue', 'Vue', 3],
  ['nitro', 'Nitro', 3],
  ['pinia', 'Pinia', 3],
  ['vueuse', 'VueUse', 3],
  ['vue router', 'Vue Router', 3],
]

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

/** Вес технологии в выдаче: Nuxt и модули рядом — 10, Vue и Nitro — 3, остальное — 0. */
function nuxtStackWeight(keyword: string): number {
  const term = normalizeTech(keyword)
  if (term.startsWith('nuxt ')) {
    return 10
  }

  return NUXT_STACK_LABELS.find(([name]) => name === term)?.[2] ?? 0
}

/** Сумма весов уже отобранных совпадений: её считает сортировка, без повторного разбора текста. */
function nuxtStackRank(labels: readonly string[]): number {
  return labels.reduce((sum, label) => sum + nuxtStackWeight(label), 0)
}

/** Nuxt и соседние технологии — впереди, внутри группы тяжелее вес выше. */
function orderByNuxtStack(labels: readonly string[]): string[] {
  const nuxt: string[] = []
  const rest: string[] = []

  for (const label of labels) {
    if (nuxtStackWeight(label) > 0) {
      nuxt.push(label)
    } else {
      rest.push(label)
    }
  }

  nuxt.sort((left, right) => nuxtStackWeight(right) - nuxtStackWeight(left))
  return [...nuxt, ...rest]
}

/**
 * Совпадения стека Nuxt в критерии «стек».
 * Если список совпадений уже записан при скоринге — берём его.
 * Старые оценки без списка читаем из текста причины. Заголовок «стека Nuxt»
 * в причине — не совпадение, поэтому перед поиском он вырезается.
 */
export function nuxtStackLabels(criteria: readonly ScoreCriterion[]): string[] {
  const stack = criteria.find((item) => item.key === 'stack')
  if (!stack) {
    return []
  }

  if (stack.matches) {
    return orderByNuxtStack(stack.matches).filter((label) => nuxtStackWeight(label) > 0)
  }

  const flat = flatText(stack.reason).replaceAll('стека nuxt', '')
  return NUXT_STACK_LABELS.filter(([term]) => mentions(flat, term)).map(([, label]) => label)
}

/** Сравнение выдачи: сильнее стек Nuxt — выше, при равенстве — выше оценка. */
export function compareNuxtStackFirst(
  left: { total: number; nuxtStack: readonly string[] },
  right: { total: number; nuxtStack: readonly string[] },
): number {
  const byStack = nuxtStackRank(right.nuxtStack) - nuxtStackRank(left.nuxtStack)
  return byStack !== 0 ? byStack : right.total - left.total
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

/** Совпавшие технологии портрета в тексте вакансии: список для объяснения и для письма. */
/** Написание технологии для человека: без версии и пояснений, но с точками и регистром. */
function techLabel(keyword: string): string {
  return keyword
    .replace(/\(.*?\)/g, ' ')
    .replace(/@/g, '')
    .replace(/\s+\d+(?:\.\d+)?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Совпавшие технологии портрета в написании ключевых навыков: для причин и писем. */
export function matchedTech(portrait: CandidatePortrait, text: string): string[] {
  const flat = flatText(text)
  const seen = new Set<string>()
  const labels: string[] = []

  for (const keyword of portrait.hh.keywords) {
    const term = normalizeTech(keyword)
    if (!term || seen.has(term) || !mentions(flat, term)) {
      continue
    }
    seen.add(term)
    labels.push(techLabel(keyword))
  }

  return orderByNuxtStack(labels)
}

/** «Nuxt, Vue и другие» — короткий список для причины, без обрезки посередине названия. */
function listed(labels: readonly string[], limit: number): string {
  const head = labels.slice(0, limit).join(', ')
  return labels.length > limit ? `${head} и другие` : head
}

/** Стек: сколько технологий портрета встретилось в вакансии; полный балл — с трёх. */
function scoreStack(portrait: CandidatePortrait, text: string, weight: number): ScoreCriterion {
  const matched = matchedTech(portrait, text)
  const earned = Math.round(
    (weight * Math.min(matched.length, STACK_MATCHES_FOR_FULL)) / STACK_MATCHES_FOR_FULL,
  )
  const splitAt = matched.findIndex((label) => nuxtStackWeight(label) === 0)
  const nuxt = splitAt === -1 ? matched : matched.slice(0, splitAt)
  const rest = splitAt === -1 ? [] : matched.slice(splitAt)
  const progress = `(${matched.length} из ${STACK_MATCHES_FOR_FULL} для полного балла)`

  let reason = 'ни одна технология портрета в вакансии не встретилась'
  if (nuxt.length && rest.length) {
    const nuxtList = listed(nuxt, 5)
    const restList = listed(rest, 3)
    reason = `совпали технологии стека Nuxt: ${nuxtList}; ещё из портрета: ${restList} ${progress}`
  } else if (nuxt.length) {
    reason = `совпали технологии стека Nuxt: ${listed(nuxt, 5)} ${progress}`
  } else if (rest.length) {
    reason = `совпали технологии портрета, без стека Nuxt: ${listed(rest, 5)} ${progress}`
  }

  return {
    key: 'stack',
    weight,
    earned,
    reason,
    matches: matched,
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
