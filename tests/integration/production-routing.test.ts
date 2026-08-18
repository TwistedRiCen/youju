import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProductionCandidateHandler } from '../../scripts/serve-production-candidate.js'

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

async function fetchOnce(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, options)
}

describe.skipIf(!existsSync(distIndex))('production candidate routing', () => {
  it('serves the app shell with SPA fallback for public and workspace routes', async () => {
    for (const path of ['/', '/privacy', '/about', '/cases/00000000-0000-4000-8000-000000000001']) {
      const response = await fetchOnce(path)
      expect(response.status, `route ${path}`).toBe(200)
      expect(response.headers.get('content-type') ?? '', `route ${path}`).toContain('text/html')
      expect(await response.text()).toContain('<div id="app">')
    }
  })

  it('serves static assets and the public demo fixture', async () => {
    const demoManifest = await fetchOnce('/demo/m4-ecommerce-refund-demo-v1/manifest.json')
    expect(demoManifest.status).toBe(200)
    expect(demoManifest.headers.get('content-type') ?? '').toContain('application/json')

    const html = await fetchOnce('/')
    const htmlText = await html.text()
    const assetMatch = htmlText.match(/src="(\/assets\/[^"]+\.js)"/)
    expect(assetMatch).not.toBeNull()
    const assetResponse = await fetchOnce(assetMatch![1] as string)
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('revalidates the shell entry points instead of caching them', async () => {
    for (const path of ['/index.html', '/sw.js', '/manifest.webmanifest', '/release.json']) {
      const response = await fetchOnce(path)
      expect(response.status, `path ${path}`).toBe(200)
      expect(response.headers.get('cache-control'), `path ${path}`).toBe('no-cache')
    }
  })

  it('excludes /ai and /health from the SPA fallback and never caches them', async () => {
    const aiNavigation = await fetchOnce('/ai')
    expect(aiNavigation.status).not.toBe(200)
    expect(aiNavigation.headers.get('content-type') ?? '').not.toContain('text/html')
    expect(aiNavigation.headers.get('cache-control')).toBe('no-store')

    const health = await fetchOnce('/health')
    expect(health.status).toBe(404)
    expect(health.headers.get('content-type') ?? '').not.toContain('text/html')
    expect(health.headers.get('cache-control')).toBe('no-store')

    const aiTask = await fetchOnce('/ai/connection-test')
    expect(aiTask.status).toBe(502)
    expect(aiTask.headers.get('cache-control')).toBe('no-store')
  })

  it('returns no-store 404 for unknown file-like paths', async () => {
    const missing = await fetchOnce('/assets/missing-file.js')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    expect(missing.headers.get('content-type') ?? '').not.toContain('text/html')
  })

  it('describes the built release without secrets', async () => {
    const release = await fetchOnce('/release.json')
    expect(release.status).toBe(200)
    const body = (await release.json()) as Record<string, unknown>
    expect(body.releaseId).toMatch(/^[A-Za-z0-9._-]{1,80}$/)
    expect(body.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(body.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(body.indexedDbVersion).toBe(4)
    expect(body.caseSchemaVersion).toBe(2)
    expect(body.demoFixtureId).toBe('m4-ecommerce-refund-demo-v1')
    const serialized = JSON.stringify(body)
    expect(serialized).not.toMatch(/key|token|secret|password/i)
  })
})
