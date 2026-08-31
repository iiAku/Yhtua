import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['app/composables/**/*.ts', 'packages/domain/src/**/*.ts'],
    },
    projects: [
      {
        plugins: [vue()],
        resolve: {
          alias: {
            '~': fileURLToPath(new URL('./app', import.meta.url)),
          },
        },
        test: {
          name: 'app',
          environment: 'jsdom',
          restoreMocks: true,
          clearMocks: true,
          include: ['app/**/*.test.ts', 'test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'mobile',
          environment: 'node',
          restoreMocks: true,
          clearMocks: true,
          include: ['apps/mobile/test/**/*.test.ts'],
        },
      },
      {
        test: {
          // Node environment on purpose: the domain package must never rely on
          // DOM globals, or it breaks under React Native's Hermes runtime.
          name: 'domain',
          environment: 'node',
          restoreMocks: true,
          clearMocks: true,
          include: ['packages/domain/test/**/*.test.ts'],
        },
      },
    ],
  },
})
