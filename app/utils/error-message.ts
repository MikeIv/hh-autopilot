/** Текст ошибки от Nitro: `statusMessage` из ответа, иначе запасная фраза. */
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const data = 'data' in error ? (error as { data?: unknown }).data : null
    if (typeof data === 'object' && data !== null && 'statusMessage' in data) {
      const message = (data as { statusMessage?: unknown }).statusMessage
      if (typeof message === 'string' && message.length > 0) {
        return message
      }
    }
  }

  return fallback
}
