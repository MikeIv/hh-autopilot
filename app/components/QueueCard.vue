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

const statusTone = computed(() => {
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
      <div :class="$style.headline">
        <a :class="$style.link" :href="item.url" target="_blank" rel="noreferrer">
          {{ item.title }}
        </a>
        <div :class="$style.employer">
          <img
            v-if="item.employer.logo"
            :class="$style.logo"
            :src="item.employer.logo"
            alt=""
            width="48"
            height="48"
          />
          <div :class="$style.employerBody">
            <a
              v-if="item.employer.url"
              :class="$style.company"
              :href="item.employer.url"
              target="_blank"
              rel="noreferrer"
            >
              {{ item.company }}
            </a>
            <p v-else :class="$style.company">{{ item.company }}</p>
            <p v-if="item.area || item.salary" :class="$style.meta">
              <span v-if="item.area">{{ item.area }}</span>
              <span v-if="item.area && item.salary"> · </span>
              <span v-if="item.salary">{{ item.salary }}</span>
            </p>
            <ul v-if="badges.length" :class="$style.badges">
              <li v-for="badge in badges" :key="badge" :class="$style.badge">{{ badge }}</li>
            </ul>
            <p v-if="ratingText" :class="$style.rating">{{ ratingText }}</p>
          </div>
        </div>
        <p v-if="item.nuxtStack.length" :class="$style.nuxt">
          Стек Nuxt: {{ item.nuxtStack.join(', ') }}
        </p>
        <p v-if="sentAtText" :class="$style.sentAt">Отправлено {{ sentAtText }}</p>
      </div>
      <div :class="$style.side">
        <span :class="[$style.score, item.score.total >= 80 && $style.scoreHigh]">
          {{ item.score.total }}
        </span>
        <span :class="[$style.status, $style[statusTone]]">{{ statusLabel }}</span>
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
    <template v-else>
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
          <UiLoader
            v-if="choosing && choosingVariant === draft.variant"
            size="sm"
            decorative
          />
          {{ VARIANT_LABELS[draft.variant] }}
          <span v-if="draft.recommended" :class="$style.recommended"> · рекоменд.</span>
        </button>
      </div>
      <p :class="$style.variant">
        Письмо · {{ letter.variant }} · {{ letter.charCount }} знаков ·
        {{ letter.chosen ? 'выбрано человеком' : 'рекомендация генератора' }}
      </p>
      <pre :class="$style.letter">{{ letter.body }}</pre>
    </template>

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
  padding: var(--space-3);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.decided {
  background: var(--surface-muted);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.headline {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.link {
  color: var(--text);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.employer {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
}

.logo {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-muted);
}

.employerBody {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.company {
  margin: 0;
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.meta,
.sentAt,
.variant,
.rating {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.badge {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--beige);
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 600;
}

.nuxt,
.sentAt {
  margin: 0;
  color: var(--success);
  font-size: 0.9rem;
  font-weight: 600;
}

.side {
  display: flex;
  flex-shrink: 0;
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
  text-align: center;
}

.scoreHigh {
  background: var(--success-bg);
  color: var(--success);
}

.status {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.8rem;
  font-weight: 600;
}

.neutral {
  background: var(--surface-muted);
  color: var(--text-muted);
}

.good {
  background: var(--success-bg);
  color: var(--success);
}

.bad {
  background: var(--danger-bg);
  color: var(--danger);
}

.criteria {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}

.criterion {
  display: flex;
  gap: var(--space-1);
}

.criterionScore {
  flex-shrink: 0;
  width: 4.5rem;
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.criterionReason {
  color: var(--text-muted);
}

.variantRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
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
  font-size: 0.9rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--text);
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

.letter {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-control);
  background: var(--surface-muted);
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
</style>
