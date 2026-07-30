import vue from '@vitejs/plugin-vue'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [vue()],
  test: {
    name: '@youju/web',
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
