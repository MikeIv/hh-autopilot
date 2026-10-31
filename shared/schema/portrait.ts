import { z } from 'zod'

/** Месяц `YYYY-MM` — как в `resume.yaml`: других форматов дат портрет не знает. */
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ожидается месяц в формате YYYY-MM')

const nonEmpty = z.string().trim().min(1)

/** Формат занятости в терминах hh: от него зависит критерий «формат и занятость». */
export const workFormatSchema = z.enum(['remote', 'hybrid', 'office'])

export const portraitSalarySchema = z.object({
  amount: z.number().int().positive(),
  currency: z.enum(['RUR', 'USD', 'EUR']),
  period: z.enum(['month', 'hour']),
  note: nonEmpty.optional(),
})

export const portraitLocationSchema = z.object({
  city: nonEmpty,
  countryCode: z.string().length(2),
})

export const portraitBasicsSchema = z.object({
  /** Заголовок резюме: роль и стек одной строкой. */
  label: nonEmpty,
  summary: nonEmpty,
  location: portraitLocationSchema,
  formats: z.array(workFormatSchema).min(1),
  salary: portraitSalarySchema,
})

export const portraitExperienceSchema = z.object({
  company: nonEmpty,
  legalName: nonEmpty.optional(),
  position: nonEmpty,
  from: monthSchema,
  /** `null` — текущее место работы. */
  to: monthSchema.nullable(),
  location: nonEmpty.optional(),
  summary: nonEmpty,
  achievements: z.array(nonEmpty).min(1),
  stack: z.array(nonEmpty),
})

export const portraitSkillGroupSchema = z.object({
  group: nonEmpty,
  items: z.array(nonEmpty).min(1),
})

/** Ранний опыт: период в прозе источника и текст; по нему считается начало стажа. */
export const portraitEarlyExperienceSchema = z.object({
  period: nonEmpty,
  text: nonEmpty,
})

/** Желаемые критерии работы: в какой области, на каком продукте, в какой команде. */
export const portraitCriteriaSchema = z.object({
  domain: nonEmpty,
  product: nonEmpty,
  team: nonEmpty,
  process: nonEmpty,
})

/** Поле KEYWORDS у hh принимает не больше 30 тегов — это ограничение площадки. */
export const HH_KEYWORDS_LIMIT = 30

export const portraitHhSchema = z.object({
  keywords: z.array(nonEmpty).min(1).max(HH_KEYWORDS_LIMIT),
  portrait: portraitCriteriaSchema,
})

/**
 * Портрет кандидата — подмножество `resume-site/data/resume.yaml`, нужное поиску,
 * скорингу и письмам: роль, опыт, навыки, зарплата, форматы и критерии hh.
 * Неизвестные ключи источника отбрасываются: второй источник правды не заводим.
 */
export const candidatePortraitSchema = z.object({
  basics: portraitBasicsSchema,
  experience: z.array(portraitExperienceSchema).min(1),
  skills: z.array(portraitSkillGroupSchema).min(1),
  hh: portraitHhSchema,
  /** Необязателен: без него стаж считается только по основному блоку опыта. */
  earlyExperience: z.array(portraitEarlyExperienceSchema).min(1).optional(),
})
