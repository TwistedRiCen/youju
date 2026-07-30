import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

describe('API logging', () => {
  it('redacts credentials from request-like log data', async () => {
    const { loggerOptions } = await import('../src/logging.js')
    const { default: fastify } = await import('fastify')
    let serializedLog = ''
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        serializedLog += String(chunk)
        callback()
      },
    })
    const app = fastify({
      logger: {
        ...loggerOptions,
        stream: destination,
      },
    })
    const requestLike = {
      headers: {
        authorization: 'Bearer sk-test-secret',
        'x-api-key': 'sk-test-secret',
      },
      body: { apiKey: 'sk-test-secret', model: 'test-model' },
    }

    app.log.info({
      req: requestLike,
      body: requestLike.body,
      apiKey: requestLike.body.apiKey,
    })
    await app.close()

    expect(serializedLog).toContain('[Redacted]')
    expect(serializedLog).not.toContain('sk-test-secret')
    expect(serializedLog).toContain('test-model')
  })
})
