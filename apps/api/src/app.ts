import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { loggerOptions } from './logging.js'
import { healthRoute } from './routes/health.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: loggerOptions })

  void app.register(healthRoute)

  return app
}
