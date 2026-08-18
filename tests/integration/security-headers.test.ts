import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProductionCandidateHandler,
  PRODUCTION_SECURITY_HEADERS,
} from '../../scripts/serve-production-candidate.js'

// These tests exercise the built production output; when no build exists
// (fresh checkout before `pnpm build`) they are skipped and run later by
// the release-candidate gate.
const distIndex = fileURLToPath(new URL('../../apps/web/dist/index.html', import.meta.url))

let server: ReturnType<typeof createServer>
let baseUrl = ''

beforeAll(async () => {
  server = createServer(createProductionCandidateHandler())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('candidate server did not bind')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

describe.skipIf(!existsSync(distIndex))('production security headers', () => {
  it('applies the frozen CSP without unsafe tokens or remote sources', async () => {
    const response = await fetch(`${baseUrl}/`)
    const csp = response.headers.get('content-security-policy')
    expect(csp).toBe(PRODUCTION_SECURITY_HEADERS['content-security-policy'])
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/https?:\/\//)
  })

  it('sets HSTS for one year without subdomains or preload', async () => {
    const response = await fetch(`${baseUrl}/`)
    const hsts = response.headers.get('strict-transport-security')
    expect(hsts).toBe('max-age=31536000')
    expect(hsts).not.toContain('includeSubDomains')
    expect(hsts).not.toContain('preload')
  })

  it('sets the fixed browser hardening headers and never enables COEP', async () => {
    const response = await fetch(`${baseUrl}/`)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(response.headers.get('cross-origin-embedder-policy')).toBeNull()
    const permissions = response.headers.get('permissions-policy')
    expect(permissions).toContain('camera=()')
    expect(permissions).toContain('microphone=()')
    expect(permissions).toContain('geolocation=()')
    expect(permissions).toContain('payment=()')
    expect(permissions).toContain('usb=()')
    expect(permissions).toContain('clipboard-write=(self)')
  })

  it('keeps dynamic API and error responses no-store', async () => {
    for (const path of ['/ai/connection-test', '/health', '/assets/missing-file.js']) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.headers.get('cache-control'), `path ${path}`).toBe('no-store')
    }
  })

  it('marks hashed assets immutable and shell entry points revalidating', async () => {
    const html = await fetch(`${baseUrl}/`)
    const htmlText = await html.text()
    const assetMatch = htmlText.match(/src="(\/assets\/[^"]+\.js)"/)
    expect(assetMatch).not.toBeNull()
    const assetResponse = await fetch(`${baseUrl}${assetMatch![1]}`)
    expect(assetResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

    const shell = await fetch(`${baseUrl}/sw.js`)
    expect(shell.headers.get('cache-control')).toBe('no-cache')
  })
})
