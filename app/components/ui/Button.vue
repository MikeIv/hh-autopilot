<script setup lang="ts">
export type UiButtonVariant = 'primary' | 'secondary' | 'danger'

withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: UiButtonVariant
    disabled?: boolean
  }>(),
  {
    type: 'button',
    variant: 'primary',
    disabled: false,
  },
)
</script>

<template>
  <button :class="[$style.root, $style[variant]]" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>

<style module lang="scss">
.root {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 10px 18px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  appearance: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.primary {
  background: var(--action-bg);
  color: var(--action-text);
}

.secondary {
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
}

.danger {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}
</style>
