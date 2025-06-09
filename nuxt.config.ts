import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  srcDir: './src',
  ssr: false,
  compatibilityDate: '2025-01-30',
  vite: {
    plugins: [tailwindcss()],
  },
})
