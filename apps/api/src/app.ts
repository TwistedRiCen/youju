import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { loggerOptions } from './logging.js'
import { healthRoute } from './routes/health.js'
import { aiRoutes, createDefaultAiRouteDependencies, type CreateAdapter } from './routes/ai.js'
import type { DnsResolver } from './ai/target-policy.js'
import type { Clock } from './ai/request-guard.js'
import { MAX_REQUEST_BYTES } from './routes/ai.js'
import type { ProductionConfig } from './production-config.js'

export interface AppDependencies {
  readonly createAdapter: CreateAdapter
  readonly resolver: DnsResolver
  readonly clock: Clock
}

const DEV_RELEASE_ID = 'dev-build'

export function buildApp(
  overrides: Partial<AppDependencies> = {},
  production: ProductionConfig | null = null,
): FastifyInstance {
  const dependencies = createDefaultAiRouteDependencies(overrides)
  const app = Fastify({
    logger: loggerOptions,
    bodyLimit: MAX_REQUEST_BYTES,
    ajv: { customOptions: { removeAdditional: false } },
    trustProxy: production === null ? false : ([...production.trustedProxyCidrs] as string[]),
  })

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store')
  })
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 400
    const code = 'provider_content_rejected' as const
    reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 400)
      .send({ error: { code } })
  })

  void app.register(healthRoute, { releaseId: production?.releaseId ?? DEV_RELEASE_ID })
  void app.register(aiRoutes, dependencies)

  return app
}
