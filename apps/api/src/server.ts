import { buildApp } from './app.js'
import { parseProductionConfig } from './production-config.js'

const isProduction = process.env.NODE_ENV === 'production'
let production = null
try {
  production = isProduction ? parseProductionConfig(process.env) : null
} catch (error) {
  console.error(
    'invalid production configuration:',
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
}

const app = buildApp({}, production)
const port = Number(process.env.PORT ?? 3000)

const SHUTDOWN_TIMEOUT_MS = 10_000
let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  const force = setTimeout(() => {
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  force.unref()
  app.log.info({ signal }, 'shutting down')
  void app.close().then(
    () => {
      clearTimeout(force)
      process.exit(0)
    },
    (error: unknown) => {
      app.log.error(error)
      clearTimeout(force)
      process.exit(1)
    },
  )
}
try {
  await app.listen({ host: '0.0.0.0', port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
