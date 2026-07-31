import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/timeline',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
