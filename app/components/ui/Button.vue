<script setup lang="ts">
export type UiButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger'

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
    color 0.2s ease,
    border-color 0.2s ease;

  &:focus-visible {
    outline: 2px solid var(--accent);
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

.accent {
  background: var(--accent);
  color: var(--on-accent);

  &:hover:not(:disabled) {
    background: var(--accent-strong);
  }
}

/* Выключенная кнопка не должна спорить с активной: уходит на нейтральную заливку. */
.primary:disabled,
.accent:disabled {
  background: var(--surface-muted);
  color: var(--text-muted);
  opacity: 1;
}

.secondary {
  border-color: var(--line-strong);
  background: var(--surface);
  color: var(--text);
}

.danger {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}
</style>
