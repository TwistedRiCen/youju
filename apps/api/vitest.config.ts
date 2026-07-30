import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/api',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
