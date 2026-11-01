<script setup lang="ts">
/** Тема как свитчер: дорожка с солнцем и луной, бегунок едет к активной стороне. */
const { theme, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="theme === 'dark'"
    aria-label="Тёмная тема"
    :class="$style.root"
    @click="toggle"
  >
    <span :class="$style.track" aria-hidden="true">
      <span :class="[$style.icon, $style.sun]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4.2" />
          <path
            d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
          />
        </svg>
      </span>
      <span :class="[$style.icon, $style.moon]">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.5 15.6A8.9 8.9 0 0 1 8.4 3.5a9.1 9.1 0 1 0 12.1 12.1Z" />
        </svg>
      </span>
      <span :class="$style.thumb" />
    </span>
  </button>
</template>

<style module lang="scss">
.root {
  display: inline-flex;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--accent-bright);
    outline-offset: 2px;
  }
}

/*
 * Свитчер живёт в тёмной шапке, но может стоять и на светлой поверхности,
 * поэтому цвета берутся из `--switch-*` с обычными токенами как запасными.
 */
.track {
  position: relative;
  display: block;
  width: 56px;
  height: 30px;
  border: 1px solid var(--switch-line, var(--line));
  border-radius: var(--radius-pill);
  background: var(--switch-track, var(--surface-muted));
}

.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--switch-thumb, var(--surface));
  box-shadow: 0 1px 2px rgb(1 1 1 / 18%);
  transition: transform 0.2s ease;
}

.icon {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--switch-icon, var(--text-muted));
  transform: translateY(-50%);
  transition: color 0.2s ease;

  svg {
    width: 100%;
    height: 100%;
  }
}

.sun {
  left: 7px;
}

.moon {
  right: 7px;
}

.root[aria-checked='true'] .thumb {
  transform: translateX(26px);
}

.root[aria-checked='true'] .sun,
.root[aria-checked='false'] .moon {
  color: var(--switch-icon, var(--text-muted));
}

.root[aria-checked='true'] .moon,
.root[aria-checked='false'] .sun {
  color: var(--switch-icon-active, var(--text));
}

@media (prefers-reduced-motion: reduce) {
  .thumb,
  .icon {
    transition: none;
  }
}
</style>
