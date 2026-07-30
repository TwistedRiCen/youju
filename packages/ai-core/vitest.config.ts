import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/ai-core',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
