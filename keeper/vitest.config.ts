import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/solana/**/*.ts'],
      exclude: ['src/solana/**/*.test.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
})
