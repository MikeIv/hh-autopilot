const CURRENCY_SIGNS: Record<string, string> = { RUR: '₽', USD: '$', EUR: '€' }

/** «250 000 – 350 000 ₽», «от 200 000 ₽», «до 300 000 ₽» или ничего. */
export function formatSalaryText(
  from: number | null,
  to: number | null,
  currency: string | null,
): string | null {
  if (from === null && to === null) {
    return null
  }

  const sign = currency ? (CURRENCY_SIGNS[currency] ?? currency) : ''
  const tail = sign ? ` ${sign}` : ''
  const format = (value: number): string => new Intl.NumberFormat('ru-RU').format(value)

  if (from !== null && to !== null) {
    return from === to ? `${format(from)}${tail}` : `${format(from)} – ${format(to)}${tail}`
  }

  return from !== null ? `от ${format(from)}${tail}` : `до ${format(to ?? 0)}${tail}`
}
