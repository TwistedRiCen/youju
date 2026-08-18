import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = join(repositoryRoot, 'apps', 'web', 'dist')
const apiOrigin = { host: '127.0.0.1', port: Number(process.env.API_PORT ?? 3000) }

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "media-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

export const PRODUCTION_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), fullscreen=(self), clipboard-write=(self)',
}

const REVALIDATED_PATHS = new Set(['/index.html', '/sw.js', '/manifest.webmanifest', '/release.json'])

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.otf': 'font/otf',
}

function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(PRODUCTION_SECURITY_HEADERS)) {
    response.setHeader(name, value)
  }
}

function cacheControlForPath(pathname: string): string {
  if (pathname.startsWith('/ai/') || pathname === '/health') {
    return 'no-store'
  }
  if (pathname.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable'
  }
  if (REVALIDATED_PATHS.has(pathname)) {
    return 'no-cache'
  }
  if (pathname.startsWith('/demo/')) {
    return 'public, max-age=31536000, immutable'
  }
  return 'no-cache'
}

function sendFile(response: ServerResponse, filePath: string, urlPathname: string, status = 200): void {
  const extension = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[extension] ?? 'application/octet-stream'
  response.statusCode = status
  response.setHeader('content-type', contentType)
  response.setHeader('cache-control', cacheControlForPath(urlPathname))
  createReadStream(filePath).pipe(response)
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

function sendNotFound(response: ServerResponse): void {
  sendText(response, 404, 'not found')
}

function resolveDistFile(pathname: string): string | null {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
  const candidate = normalize(join(distRoot, relative))
  const rootPrefix = distRoot.endsWith(sep) ? distRoot : `${distRoot}${sep}`
  if (candidate !== distRoot && !candidate.startsWith(rootPrefix)) {
    return null
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return null
  }
  return candidate
}

function proxyToApi(request: IncomingMessage, response: ServerResponse): void {
  const upstream = httpRequest(
    { host: apiOrigin.host, port: apiOrigin.port, path: request.url, method: request.method, headers: request.headers },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502
      response.setHeader('content-type', upstreamResponse.headers['content-type'] ?? 'application/json')
      response.setHeader('cache-control', 'no-store')
      upstreamResponse.pipe(response)
    },
  )
  upstream.on('error', () => {
    response.statusCode = 502
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify({ error: { code: 'provider_unreachable' } }))
  })
  request.pipe(upstream)
}

export function createProductionCandidateHandler(): RequestListener {
  return (request, response) => {
    applySecurityHeaders(response)
    const url = new URL(request.url ?? '/', 'http://local')
    let pathname: string
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      sendNotFound(response)
      return
    }

    const isAiPath = pathname === '/ai' || pathname.startsWith('/ai/')
    if (isAiPath) {
      proxyToApi(request, response)
      return
    }
    if (pathname === '/health') {
      sendNotFound(response)
      return
    }

    const file = resolveDistFile(pathname)
    if (file !== null) {
      sendFile(response, file, url.pathname)
      return
    }

    const accept = String(request.headers.accept ?? '')
    const acceptsNavigation = accept.includes('text/html') || accept.includes('*/*') || accept === ''
    const looksLikeFile = extname(pathname) !== ''
    if (request.method === 'GET' && acceptsNavigation && !looksLikeFile) {
      sendFile(response, join(distRoot, 'index.html'), '/index.html')
      return
    }
    sendNotFound(response)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4174)
  const server = createServer(createProductionCandidateHandler())
  server.listen(port, '127.0.0.1', () => {
    console.log(`production candidate serving ${distRoot} on http://127.0.0.1:${port}`)
  })
}
