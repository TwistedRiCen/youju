import type { FastifyPluginAsync } from 'fastify'

export interface HealthRouteOptions {
  readonly releaseId: string
}

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/health', async () => ({
    status: 'ok',
    releaseId: options.releaseId,
  }))
}
