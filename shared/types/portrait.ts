import type { z } from 'zod'
import type { candidatePortraitSchema } from '../schema/portrait'

/**
 * Контракт портрета кандидата. Форму задаёт zod-схема `shared/schema/portrait.ts`,
 * типы выводятся из неё — расхождение поймает typecheck, а не рантайм.
 */
export type CandidatePortrait = z.infer<typeof candidatePortraitSchema>

export type PortraitBasics = CandidatePortrait['basics']
export type PortraitLocation = PortraitBasics['location']
export type PortraitSalary = PortraitBasics['salary']
export type WorkFormat = PortraitBasics['formats'][number]

export type PortraitExperience = CandidatePortrait['experience'][number]
export type PortraitSkillGroup = CandidatePortrait['skills'][number]
/** Желаемые критерии работы (`hh.portrait` в источнике). */
export type PortraitCriteria = CandidatePortrait['hh']['portrait']
