<script setup lang="ts">
/** Компактный статус: тон задаёт смысл, точка — «живое» состояние. */
export type UiPillTone = 'neutral' | 'good' | 'bad' | 'accent'

withDefaults(
  defineProps<{
    tone?: UiPillTone
    dot?: boolean
  }>(),
  {
    tone: 'neutral',
    dot: false,
  },
)
</script>

<template>
  <span :class="[$style.root, $style[tone]]">
    <span v-if="dot" :class="$style.dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style module lang="scss">
.root {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentcolor;
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

.accent {
  background: var(--beige);
  color: var(--ink);
}
</style>
