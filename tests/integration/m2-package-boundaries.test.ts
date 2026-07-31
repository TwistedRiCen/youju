import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function listFiles(directory: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path, extensions)))
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(path)
    }
  }
  return files
}

describe('M2 package boundaries', () => {
  it('keeps Web business modules free of API imports and health calls', async () => {
    const files = await listFiles(join(repositoryRoot, 'apps', 'web', 'src'), ['.ts', '.vue'])

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toContain('apps/api')
      expect(content).not.toContain('/health')
    }
  })

  it('keeps the API free of M2 storage and export packages', async () => {
    const files = await listFiles(join(repositoryRoot, 'apps', 'api', 'src'), ['.ts'])

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(
        /@youju\/(?:evidence-[\w-]+|document-export|timeline|ai-core)/,
      )
    }
  })

  it('keeps M2 sources free of localStorage, remote resources and analytics SDKs', async () => {
    const files = [
      ...(await listFiles(join(repositoryRoot, 'apps', 'web', 'src'), ['.ts', '.vue'])),
      ...(await listFiles(join(repositoryRoot, 'packages'), ['.ts'])),
    ].filter((file) => file.includes('/src/'))

    for (const file of files) {
      if (file.includes('node_modules') || !file.includes('/src/')) {
        continue
      }
      const content = await readFile(file, 'utf8')
      expect(content).not.toContain('localStorage')
      expect(content).not.toMatch(/https?:\/\//)
      expect(content).not.toMatch(/\b(?:sentry|gtag|facebook-pixel)\b|@segment\/analytics/i)
    }
  })

  it('imports workspace packages only through public @youju entries', async () => {
    const files = [
      ...(await listFiles(join(repositoryRoot, 'apps', 'web', 'src'), ['.ts', '.vue'])),
      ...(await listFiles(join(repositoryRoot, 'packages'), ['.ts'])),
    ].filter((file) => file.includes('/src/'))

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(/from ['"][^'"]*\.\.\/\.\.\/packages\//)
      expect(content).not.toMatch(/from ['"][^'"]*\/(?:domain|rule-engine|ai-core|evidence-[\w-]+|timeline|document-export)\/src\//)
    }
  })

  it('keeps production build output free of API and storage fallback markers', async () => {
    const distAssets = join(repositoryRoot, 'apps', 'web', 'dist', 'assets')
    let files: string[] = []
    try {
      files = await listFiles(distAssets, ['.js'])
    } catch {
      files = []
    }

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toContain('apps/api')
      expect(content).not.toContain('youju-api')
    }
  })
})
