import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/evidence-hash',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
