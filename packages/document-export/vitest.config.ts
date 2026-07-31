import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/document-export',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
