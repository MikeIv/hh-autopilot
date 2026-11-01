export type ColorTheme = 'light' | 'dark'

const STORAGE_KEY = 'hh-theme'

function isTheme(value: string | null | undefined): value is ColorTheme {
  return value === 'light' || value === 'dark'
}

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Светлая или тёмная тема. Пока человек не выбрал, страница следует системе
 * и ничего не записывает. Выбор запоминается в localStorage.
 */
export function useTheme() {
  const theme = useState<ColorTheme>('color-theme', () => 'light')

  function apply(next: ColorTheme, persist: boolean): void {
    theme.value = next
    if (!import.meta.client) {
      return
    }
    document.documentElement.dataset.theme = next
    if (!persist) {
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Выбор остаётся на странице, даже если браузер запретил запись.
    }
  }

  function toggle(): void {
    apply(theme.value === 'dark' ? 'light' : 'dark', true)
  }

  onMounted(() => {
    const stored = readStoredTheme()
    if (isTheme(stored)) {
      apply(stored, false)
      return
    }

    const fromPage = document.documentElement.dataset.theme
    if (isTheme(fromPage)) {
      theme.value = fromPage
      return
    }

    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    apply(dark ? 'dark' : 'light', false)
  })

  return { theme, toggle }
}
