import { describe, expect, it } from 'vitest'

describe('API health route', () => {
  it('returns the stateless service identity', async () => {
    const { buildApp } = await import('../src/app.js')
    const app = buildApp()

    try {
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        status: 'ok',
        service: 'youju-api',
        version: '0.1.0',
      })
    } finally {
      await app.close()
    }
  })
})
