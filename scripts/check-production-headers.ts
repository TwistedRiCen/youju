import { createServer } from 'node:http'
import {
  createProductionCandidateHandler,
  PRODUCTION_SECURITY_HEADERS,
} from './serve-production-candidate.js'

const server = createServer(createProductionCandidateHandler())
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (address === null || typeof address === 'string') {
  throw new Error('candidate server did not bind')
}
const baseUrl = `http://127.0.0.1:${address.port}`

const failures: string[] = []
async function expectHeader(path: string, header: string, expected: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`)
  const actual = response.headers.get(header)
  if (actual !== expected) {
    failures.push(`${path}: expected ${header}=${expected}, got ${actual}`)
  }
}

try {
  const shell = await fetch(`${baseUrl}/`)
  for (const [name, value] of Object.entries(PRODUCTION_SECURITY_HEADERS)) {
    const actual = shell.headers.get(name)
    if (actual !== value) {
      failures.push(`/: header ${name} mismatch`)
    }
  }
  await expectHeader('/sw.js', 'cache-control', 'no-cache')
  await expectHeader('/index.html', 'cache-control', 'no-cache')
  await expectHeader('/release.json', 'cache-control', 'no-cache')
  await expectHeader('/health', 'cache-control', 'no-store')
  await expectHeader('/ai/connection-test', 'cache-control', 'no-store')

  const htmlText = await shell.text()
  const assetMatch = htmlText.match(/src="(\/assets\/[^"]+\.js)"/)
  if (assetMatch === null) {
    failures.push('index.html has no hashed asset reference')
  } else {
    const asset = await fetch(`${baseUrl}${assetMatch[1]}`)
    const assetCache = asset.headers.get('cache-control')
    if (assetCache !== 'public, max-age=31536000, immutable') {
      failures.push(`asset ${assetMatch[1]}: unexpected cache-control ${assetCache}`)
    }
  }

  const release = await fetch(`${baseUrl}/release.json`)
  const releaseBody = (await release.json()) as Record<string, unknown>
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(String(releaseBody.releaseId ?? ''))) {
    failures.push('release.json has an invalid releaseId')
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`  ${failure}`)
  }
  throw new Error(`production header check failed with ${failures.length} violation(s)`)
}
console.log('production headers OK')
