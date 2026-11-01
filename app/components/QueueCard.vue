<script setup lang="ts">
import type { QueueDecision, QueueItem } from '../../shared/types/queue'
import type { LetterVariant } from '../../shared/types/domain'

const props = defineProps<{
  item: QueueItem
  pending?: boolean
  decision?: QueueDecision | null
  choosing?: boolean
  choosingVariant?: LetterVariant | null
  sending?: boolean
}>()

const emit = defineEmits<{
  decide: [decision: QueueDecision]
  choose: [variant: LetterVariant]
  send: []
}>()

const STATUS_LABELS: Record<QueueItem['status'], string> = {
  queued: 'В очереди',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  sending: 'Отправляется',
  sent: 'Отправлено',
  failed: 'Ошибка',
  needs_human: 'Нужен человек',
}

const VARIANT_LABELS: Record<LetterVariant, string> = {
  product: 'Продукт',
  outstaff: 'Аутстафф',
  service: 'Сервис',
}

const DECIDABLE: readonly QueueItem['status'][] = ['queued', 'failed', 'needs_human']

/** Тон статуса для пилюли: хороший, плохой или нейтральный. */
type StatusTone = 'good' | 'bad' | 'neutral'

const letter = computed(() => props.item.letter)
const statusLabel = computed(() => STATUS_LABELS[props.item.status])
const canDecide = computed(() => DECIDABLE.includes(props.item.status))
const archived = computed(() => props.item.status === 'sent' || props.item.status === 'rejected')
const canEditLetter = computed(
  () => props.item.status !== 'sent' && props.item.status !== 'sending',
)
const canSend = computed(() => props.item.status === 'approved')
const busy = computed(() => Boolean(props.pending || props.choosing || props.sending))

const approveLabel = computed(() =>
  props.item.status === 'queued' ? 'Одобрить' : 'Одобрить снова',
)

const badges = computed(() => {
  const employer = props.item.employer
  const labels: string[] = []
  if (employer.trusted) {
    labels.push('Проверенный')
  }
  if (employer.hhRating) {
    labels.push('Рейтинг hh')
  }
  if (employer.hrBrand) {
    labels.push('HR-бренд')
  }
  return labels
})

const ratingText = computed(() => {
  const { rating, reviews } = props.item.employer
  if (rating && reviews) {
    return `${rating} · ${reviews}`
  }
  return rating ?? reviews
})

const statusTone = computed<StatusTone>(() => {
  if (props.item.status === 'sent' || props.item.status === 'approved') {
    return 'good'
  }
  if (
    props.item.status === 'failed' ||
    props.item.status === 'rejected' ||
    props.item.status === 'needs_human'
  ) {
    return 'bad'
  }
  return 'neutral'
})

/** Заголовок раскрытого блока письма: вариант, длина и авторство выбора. */
const letterSummary = computed(() => {
  const current = letter.value
  if (!current) {
    return ''
  }

  const parts = ['Письмо', VARIANT_LABELS[current.variant], `${current.charCount} знаков`]
  if (!current.chosen) {
    parts.push('рекомендация')
  }
  return parts.join(' · ')
})

const sentAtText = computed(() => {
  if (!props.item.sentAt) {
    return null
  }
  return new Date(props.item.sentAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})
</script>

<template>
  <article :class="[$style.card, archived && $style.decided]">
    <header :class="$style.head">
      <div :class="$style.headMain">
        <h3 :class="$style.title">
          <a :class="$style.link" :href="item.url" target="_blank" rel="noreferrer">
            {{ item.title }}
          </a>
        </h3>

        <p :class="$style.companyRow">
          <img
            v-if="item.employer.logo"
            :class="$style.logo"
            :src="item.employer.logo"
            alt=""
            width="32"
            height="32"
          />
          <a
            v-if="item.employer.url"
            :class="$style.company"
            :href="item.employer.url"
            target="_blank"
            rel="noreferrer"
          >
            {{ item.company }}
          </a>
          <span v-else :class="$style.company">{{ item.company }}</span>
          <span v-if="item.area" :class="$style.meta">· {{ item.area }}</span>
          <span v-if="item.salary" :class="$style.meta">· {{ item.salary }}</span>
        </p>

        <p v-if="badges.length || ratingText" :class="$style.badgeRow">
          <UiPill v-for="badge in badges" :key="badge" tone="accent">{{ badge }}</UiPill>
          <span v-if="ratingText" :class="$style.rating">{{ ratingText }}</span>
        </p>

        <p v-if="item.nuxtStack.length" :class="$style.nuxt">
          Стек Nuxt: {{ item.nuxtStack.join(', ') }}
        </p>
      </div>

      <div :class="$style.headSide">
        <span :class="[$style.score, item.score.total >= 80 && $style.scoreHigh]">
          {{ item.score.total }}
        </span>
        <UiPill :tone="statusTone">{{ statusLabel }}</UiPill>
        <span v-if="sentAtText" :class="$style.sentAt">{{ sentAtText }}</span>
      </div>
    </header>

    <ul :class="$style.criteria">
      <li v-for="criterion in item.score.criteria" :key="criterion.key" :class="$style.criterion">
        <span :class="$style.criterionScore">{{ criterion.earned }} / {{ criterion.weight }}</span>
        <span :class="$style.criterionReason">{{ criterion.reason }}</span>
      </li>
    </ul>

    <UiNotice v-if="item.error" tone="error">{{ item.error }}</UiNotice>

    <UiNotice v-if="!letter">
      Письмо ещё не собрано — запусти <code>pnpm hh:letters</code>.
    </UiNotice>
    <UiDisclosure v-else>
      <template #summary>{{ letterSummary }}</template>
      <div :class="$style.variantRow" role="group" aria-label="Вариант письма">
        <button
          v-for="draft in letter.variants"
          :key="draft.variant"
          type="button"
          :class="[$style.variantButton, draft.variant === letter.variant && $style.variantActive]"
          :aria-pressed="draft.variant === letter.variant"
          :disabled="!canEditLetter || busy"
          @click="emit('choose', draft.variant)"
        >
          <UiLoader v-if="choosing && choosingVariant === draft.variant" size="sm" decorative />
          {{ VARIANT_LABELS[draft.variant] }}
          <span v-if="draft.recommended" :class="$style.recommended">· рекоменд.</span>
        </button>
      </div>
      <p :class="$style.variant">
        {{ letter.variant }} · {{ letter.charCount }} знаков ·
        {{ letter.chosen ? 'выбрано человеком' : 'рекомендация генератора' }}
      </p>
      <pre :class="$style.letter">{{ letter.body }}</pre>
    </UiDisclosure>

    <footer :class="$style.actions">
      <UiButton v-if="canSend" :disabled="busy" @click="emit('send')">
        <UiLoader v-if="sending" size="sm" decorative />
        {{ sending ? 'Отправляю…' : 'Отправить сейчас' }}
      </UiButton>
      <UiButton :disabled="busy || !canDecide" @click="emit('decide', 'approve')">
        <UiLoader v-if="pending && decision === 'approve'" size="sm" decorative />
        {{ approveLabel }}
      </UiButton>
      <UiButton variant="danger" :disabled="busy || !canDecide" @click="emit('decide', 'reject')">
        <UiLoader v-if="pending && decision === 'reject'" size="sm" decorative />
        Отклонить
      </UiButton>
    </footer>
  </article>
</template>

<style module lang="scss">
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-card);
  background: var(--surface);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    border-color: var(--line-strong);
    box-shadow: var(--shadow-card);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

/* Архив лежит на приглушённой поверхности дропдауна: карточке нужен свой фон. */
.decided {
  border-color: var(--line);
  background: var(--bg);

  &:hover {
    box-shadow: var(--shadow-card);
  }
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: start;
}

.headMain {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.35;
}

.link {
  color: var(--text);
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.decided .title {
  font-size: 1rem;
}

.companyRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 0;
  min-width: 0;
}

.logo {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-muted);
}

.company {
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.meta,
.rating,
.variant,
.sentAt {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.badgeRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 0;
}

.nuxt {
  margin: 0;
  color: var(--success);
  font-size: 0.85rem;
  font-weight: 600;
}

.headSide {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.score {
  min-width: 2.75rem;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--text);
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.scoreHigh {
  background: var(--success-bg);
  color: var(--success);
}

.criteria {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.criterion {
  display: flex;
  gap: var(--space-1);
  align-items: baseline;
}

.criterionScore {
  flex-shrink: 0;
  width: 4.25rem;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.decided .criterionScore {
  background: transparent;
  color: var(--text-muted);
}

.criterionReason {
  color: var(--text-muted);
}

.variantRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
}

.variantButton {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.variantActive {
  border-color: transparent;
  background: var(--beige);
  color: var(--ink);
  font-weight: 600;
}

.recommended {
  color: inherit;
  font-weight: 400;
  opacity: 0.75;
}

.variant {
  margin: 0 0 var(--space-1);
}

.letter {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--line);
}
</style>
