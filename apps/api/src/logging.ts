import type { FastifyRequest, FastifyServerOptions } from 'fastify'

export const loggerOptions = {
  level: 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.x-api-key',
      'body',
      'req.body',
      'apiKey',
      '*.apiKey',
      'authorization',
      '*.authorization',
      'response',
      '*.response',
      'rawResponse',
      '*.rawResponse',
      'prompt',
      '*.prompt',
      'inputText',
      '*.inputText',
      'output',
      '*.output',
      'images',
      '*.images',
      'manifest',
      '*.manifest',
      'baseUrl',
      '*.baseUrl',
      'originalOutput',
      '*.originalOutput',
      'filename',
      '*.filename',
      'fileName',
      '*.fileName',
      'title',
      '*.title',
      'candidateValue',
      '*.candidateValue',
    ],
    censor: '[Redacted]',
  },
  serializers: {
    req(request: FastifyRequest) {
      const anyRequest = request as unknown as {
        ip?: unknown
        method?: unknown
        url?: unknown
        headers?: Record<string, string | undefined>
      }
      const headers = anyRequest.headers ?? {}
      const ip = typeof anyRequest.ip === 'string' ? anyRequest.ip : ''
      const method = typeof anyRequest.method === 'string' ? anyRequest.method : undefined
      const url = typeof anyRequest.url === 'string' ? anyRequest.url : undefined
      const origin = headers.origin
      const secFetchSite = headers['sec-fetch-site']
      return {
        ...(method === undefined ? {} : { method }),
        ...(url === undefined ? {} : { url }),
        ipClass: ip.includes(':') ? 'ipv6' : 'ipv4',
        ...(origin === undefined ? {} : { origin }),
        ...(secFetchSite === undefined ? {} : { secFetchSite }),
      }
    },
  },
} satisfies NonNullable<FastifyServerOptions['logger']>
