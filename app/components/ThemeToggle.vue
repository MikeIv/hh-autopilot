<script setup lang="ts">
const { theme, toggle } = useTheme()

const label = computed(() => (theme.value === 'dark' ? 'Тёмная' : 'Светлая'))
</script>

<template>
  <button type="button" :class="$style.root" :aria-pressed="theme === 'dark'" @click="toggle">
    {{ label }}
  </button>
</template>

<style module lang="scss">
.root {
  margin: 0;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
}
</style>
