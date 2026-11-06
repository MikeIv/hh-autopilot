<script setup lang="ts">
export type UiLoaderSize = 'sm' | 'md' | 'lg'
/** `accent` — бренд-зелёный, `inherit` — чернила текста вокруг (кнопки, тёмные поверхности). */
export type UiLoaderTone = 'accent' | 'inherit'

withDefaults(
  defineProps<{
    size?: UiLoaderSize
    tone?: UiLoaderTone
    label?: string
    /** Рядом уже есть текст: спиннер не объявляется второй раз. */
    decorative?: boolean
  }>(),
  {
    size: 'md',
    tone: 'accent',
    label: 'Загрузка',
    decorative: false,
  },
)
</script>

<template>
  <progress
    :class="$style.root"
    :data-size="size"
    :data-tone="tone"
    :aria-hidden="decorative || undefined"
    :aria-label="decorative ? undefined : label"
  />
</template>

<style module lang="scss">
/*
 * Кольцо с точкой-«головой» на конце дуги (шаблон 13 из css-loaders.com).
 * Толщина кольца и диаметр точки — доли от --size, как 8px на 50px в оригинале.
 */
.root {
  --size: 28px;
  --thickness: calc(var(--size) * 0.16);
  --ink: var(--accent);
  --ring: radial-gradient(farthest-side, transparent calc(100% - var(--thickness)), #000 0);

  display: inline-block;
  flex-shrink: 0;
  width: var(--size);
  height: var(--size);
  margin: 0;
  border: 0;
  border-radius: 50%;
  background:
    radial-gradient(farthest-side, var(--ink) 94%, transparent) top center / var(--thickness)
      var(--thickness) no-repeat,
    conic-gradient(transparent 30%, var(--ink));
  appearance: none;
  animation: spin 1s linear infinite;
  -webkit-mask: var(--ring);
  mask: var(--ring);

  &[data-size='sm'] {
    --size: 16px;
  }

  &[data-size='lg'] {
    --size: 48px;
  }

  &[data-tone='inherit'] {
    --ink: currentcolor;
  }

  &:indeterminate::-webkit-progress-bar,
  &:indeterminate::-webkit-progress-value {
    display: none;
    background: none;
  }

  /* Списки разделены по движкам: непарный `::-moz-` делает всё правило невалидным в Chrome. */
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
