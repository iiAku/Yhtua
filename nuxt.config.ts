// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  css: ['~/assets/css/main.css'],
  vite:{
    plugins: [
      tailwindcss(),
    ],
  },
  nitro:{
    preset: 'static'
  }
})
