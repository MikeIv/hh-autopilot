<script setup lang="ts">
import type { QueueDecision, QueueItem } from '../../shared/types/queue'

const props = defineProps<{ item: QueueItem; pending?: boolean }>()
const emit = defineEmits<{ decide: [decision: QueueDecision] }>()

const STATUS_LABELS: Record<QueueItem['status'], string> = {
  queued: 'В очереди',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  sending: 'Отправляется',
  sent: 'Отправлено',
  failed: 'Ошибка',
  needs_human: 'Нужен человек',
}

const isQueued = computed(() => props.item.status === 'queued')
const statusLabel = computed(() => STATUS_LABELS[props.item.status])
const letter = computed(() => props.item.letter)
</script>

<template>
  <article :class="[$style.card, !isQueued && $style.decided]">
    <header :class="$style.head">
      <div :class="$style.headline">
        <a :class="$style.link" :href="item.url" target="_blank" rel="noreferrer">
          {{ item.title }}
        </a>
        <p :class="$style.meta">
          <span>{{ item.company }}</span>
          <span v-if="item.area"> · {{ item.area }}</span>
          <span v-if="item.salary"> · {{ item.salary }}</span>
        </p>
      </div>
      <div :class="$style.side">
        <span :class="[$style.score, item.score.total >= 80 && $style.scoreHigh]">
          {{ item.score.total }}
        </span>
        <span :class="$style.status">{{ statusLabel }}</span>
      </div>
    </header>

    <ul :class="$style.criteria">
      <li v-for="criterion in item.score.criteria" :key="criterion.key" :class="$style.criterion">
        <span :class="$style.criterionScore">{{ criterion.earned }} / {{ criterion.weight }}</span>
        <span :class="$style.criterionReason">{{ criterion.reason }}</span>
      </li>
    </ul>

    <p v-if="!letter" :class="$style.note">
      Письмо ещё не собрано — запусти <code>pnpm hh:letters</code>.
    </p>
    <template v-else>
      <p :class="$style.variant">Письмо · {{ letter.variant }} · {{ letter.charCount }} знаков</p>
      <pre :class="$style.letter">{{ letter.body }}</pre>
    </template>

    <footer :class="$style.actions">
      <button
        type="button"
        :class="[$style.button, $style.approve]"
        :disabled="pending || !isQueued"
        @click="emit('decide', 'approve')"
      >
        Одобрить
      </button>
      <button
        type="button"
        :class="[$style.button, $style.reject]"
        :disabled="pending || !isQueued"
        @click="emit('decide', 'reject')"
      >
        Отклонить
      </button>
    </footer>
  </article>
</template>

<style module lang="scss">
.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid #d8dce3;
  border-radius: 0.75rem;
  background: #fff;
}

.decided {
  background: #f7f8fa;
  border-color: #e4e7ec;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.headline {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.link {
  color: #15294b;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.meta {
  margin: 0;
  color: #5c6472;
  font-size: 0.9rem;
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.score {
  min-width: 2.5rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #eef1f5;
  color: #33415c;
  font-size: 1.05rem;
  font-weight: 700;
  text-align: center;
}

.scoreHigh {
  background: #e3f2e8;
  color: #1c6b3a;
}

.status {
  color: #5c6472;
  font-size: 0.8rem;
  text-transform: lowercase;
}

.criteria {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.criterion {
  display: flex;
  gap: 0.5rem;
}

.criterionScore {
  flex-shrink: 0;
  width: 4rem;
  color: #33415c;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.criterionReason {
  color: #5c6472;
}

.note,
.variant {
  margin: 0;
  color: #5c6472;
  font-size: 0.85rem;
}

.letter {
  margin: 0;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: #f7f8fa;
  color: #232a36;
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.button {
  padding: 0.4rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.approve {
  background: #1c6b3a;
  color: #fff;
}

.reject {
  border-color: #d8dce3;
  background: #fff;
  color: #8a1f1f;
}
</style>
