<script setup lang="ts">
import type { LetterVariant } from '../../shared/types/domain'
import type { QueueDecision, QueueItem } from '../../shared/types/queue'

/**
 * Список карточек очереди: одна разметка на секции «ждут решения»,
 * «в работе» и «разобранные». Состояние занятости живёт в `useQueue`.
 */
const props = defineProps<{
  items: QueueItem[]
  deciding: string | null
  decisionKind: QueueDecision | null
  choosing: string | null
  letterVariant: LetterVariant | null
  sending: string | null
}>()

const emit = defineEmits<{
  decide: [item: QueueItem, decision: QueueDecision]
  choose: [item: QueueItem, variant: LetterVariant]
  send: [item: QueueItem]
}>()

function isDeciding(item: QueueItem): boolean {
  return props.deciding === item.vacancyId
}
</script>

<template>
  <ul :class="$style.list">
    <li v-for="item in items" :key="item.vacancyId">
      <QueueCard
        :item="item"
        :pending="isDeciding(item)"
        :decision="isDeciding(item) ? decisionKind : null"
        :choosing="choosing === item.vacancyId"
        :choosing-variant="choosing === item.vacancyId ? letterVariant : null"
        :sending="sending === item.vacancyId"
        @decide="emit('decide', item, $event)"
        @choose="emit('choose', item, $event)"
        @send="emit('send', item)"
      />
    </li>
  </ul>
</template>

<style module lang="scss">
.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  min-width: 0;
}

.list li > * {
  flex: 1;
}
</style>
