import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/domain',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
