<script setup lang="ts">
export type UiNoticeTone = 'note' | 'success' | 'error'

withDefaults(
  defineProps<{
    tone?: UiNoticeTone
  }>(),
  {
    tone: 'note',
  },
)
</script>

<template>
  <p :class="[$style.root, $style[tone]]" :role="tone === 'error' ? 'alert' : 'status'">
    <slot />
  </p>
</template>

<style module lang="scss">
.root {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-control);
  font-size: 0.95rem;
  line-height: 1.45;
}

.note {
  background: var(--surface-muted);
  color: var(--text-muted);
}

.success {
  background: var(--success-bg);
  color: var(--success);
}

.error {
  background: var(--danger-bg);
  color: var(--danger);
}
</style>
