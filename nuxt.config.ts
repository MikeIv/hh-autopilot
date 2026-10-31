// https://nuxt.com/docs/api/configuration/nuxt-config
const isDev = process.env.NODE_ENV === 'development'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  modules: ['@nuxt/eslint'],

  eslint: {
    config: {
      stylistic: false,
    },
  },

  devtools: {
    enabled: isDev,
    timeline: { enabled: isDev },
  },

  typescript: {
    strict: true,
    typeCheck: 'build',
  },

  /** Локальный инструмент: наружу не публикуется, сервер и UI живут на одной машине. */
  nitro: {
    compressPublicAssets: true,
  },
})
