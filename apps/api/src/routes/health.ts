import type { FastifyPluginAsync } from 'fastify'

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'youju-api',
    version: '0.1.0',
  }))
}
