import pkg from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  css: ['~/assets/css/main.css'],
  ssr: false,
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
})
