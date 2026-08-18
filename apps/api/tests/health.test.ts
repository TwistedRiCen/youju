import { describe, expect, it } from 'vitest'

describe('API health route', () => {
  it('returns only status and a validated release ID in development', async () => {
    const { buildApp } = await import('../src/app.js')
    const app = buildApp()

    try {
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok', releaseId: 'dev-build' })
      expect(response.body).not.toContain('0.1.0')
      expect(response.body).not.toContain('youju-api')
    } finally {
      await app.close()
    }
  })

  it('reports the validated production release ID without environment details', async () => {
    const { buildApp } = await import('../src/app.js')
    const app = buildApp(
      {},
      { releaseId: '2026.08.18-1', trustedProxyCidrs: ['127.0.0.1'] },
    )

    try {
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok', releaseId: '2026.08.18-1' })
    } finally {
      await app.close()
    }
  })
})
