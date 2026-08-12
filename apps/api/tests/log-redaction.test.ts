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
      body: {
        apiKey: 'sk-test-secret',
      authorization: 'Bearer sk-test-secret',
      nested: { apiKey: 'sk-test-secret', body: 'raw-body-sentinel' },
      model: 'test-model',
      },
    }

    app.log.info({
      req: requestLike,
      body: requestLike.body,
      apiKey: requestLike.body.apiKey,
      authorization: requestLike.body.authorization,
      allowed: {
        requestId: 'request-id-sentinel',
        taskType: 'classify_evidence',
        providerPreset: 'openai',
        statusClass: '2xx',
      },
      metadata: {
        apiKey: 'sk-test-secret',
        filename: 'filename-sentinel',
        title: 'title-sentinel',
        prompt: 'prompt-sentinel',
        candidateValue: 'candidate-sentinel',
      },
    })
    await app.close()

    expect(serializedLog).toContain('[Redacted]')
    expect(serializedLog).not.toContain('sk-test-secret')
    expect(serializedLog).not.toContain('raw-body-sentinel')
    expect(serializedLog).not.toContain('filename-sentinel')
    expect(serializedLog).not.toContain('title-sentinel')
    expect(serializedLog).not.toContain('prompt-sentinel')
    expect(serializedLog).not.toContain('candidate-sentinel')
    expect(serializedLog).toContain('request-id-sentinel')
    expect(serializedLog).toContain('classify_evidence')
  })
})
