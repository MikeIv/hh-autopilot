<script setup lang="ts">
/**
 * Раскрывающийся блок на нативном `details`: клавиатура и скринридеры работают
 * без ручной логики попапа. Открытый по умолчанию блок — через `open`.
 */
withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  },
)
</script>

<template>
  <details :class="$style.root" :open="open || undefined">
    <summary :class="$style.summary">
      <span :class="$style.label"><slot name="summary" /></span>
      <span :class="$style.chevron" aria-hidden="true" />
    </summary>
    <div :class="$style.body"><slot /></div>
  </details>
</template>

<style module lang="scss">
.root {
  border-radius: var(--radius-control);
  background: var(--surface-muted);

  &[open] .chevron {
    transform: rotate(180deg);
  }
}

.summary {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.35;
  list-style: none;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover .chevron {
    border-top-color: var(--text);
  }
}

.label {
  min-width: 0;
}

.chevron {
  flex-shrink: 0;
  width: 0;
  height: 0;
  border-top: 5px solid var(--text-muted);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  transition:
    transform 0.15s ease,
    border-top-color 0.15s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.body {
  padding: 0 14px 12px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.body p {
  margin: 0;
}

.body p + p,
.body p + ul {
  margin-top: var(--space-1);
}

.body code {
  color: var(--text);
}
</style>
