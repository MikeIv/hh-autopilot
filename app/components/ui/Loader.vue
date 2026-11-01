<script setup lang="ts">
export type UiLoaderSize = 'sm' | 'md' | 'lg'

withDefaults(
  defineProps<{
    size?: UiLoaderSize
    label?: string
    /** Рядом уже есть текст: спиннер не объявляется второй раз. */
    decorative?: boolean
  }>(),
  {
    size: 'md',
    label: 'Загрузка',
    decorative: false,
  },
)
</script>

<template>
  <progress
    :class="$style.root"
    :data-size="size"
    :aria-hidden="decorative || undefined"
    :aria-label="decorative ? undefined : label"
  />
</template>

<style module lang="scss">
.root {
  --size: 28px;
  --ring: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));

  display: inline-block;
  flex-shrink: 0;
  width: var(--size);
  height: var(--size);
  margin: 0;
  border: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--beige), transparent 72%);
  appearance: none;
  overflow: hidden;
  animation: spin 0.9s linear infinite;
  mask: var(--ring);
  -webkit-mask: var(--ring);

  &[data-size='sm'] {
    --size: 16px;
  }

  &[data-size='lg'] {
    --size: 48px;
  }

  &:indeterminate::-webkit-progress-bar,
  &:indeterminate::-webkit-progress-value,
  &:indeterminate::-moz-progress-bar {
    display: none;
    background: none;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
