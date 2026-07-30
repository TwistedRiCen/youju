import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      {
        test: {
          name: 'root-config',
          include: ['tests/config/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
