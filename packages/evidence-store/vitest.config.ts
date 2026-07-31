import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/evidence-store',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
