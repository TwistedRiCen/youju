import type { FastifyServerOptions } from 'fastify'

export const loggerOptions = {
  level: 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.x-api-key', 'body.apiKey', 'apiKey'],
    censor: '[Redacted]',
  },
} satisfies NonNullable<FastifyServerOptions['logger']>
