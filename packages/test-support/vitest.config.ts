import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/test-support',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
