import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/rule-engine',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
