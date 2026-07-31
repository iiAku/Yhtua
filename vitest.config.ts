import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['app/composables/**/*.ts'],
    },
  },
})
