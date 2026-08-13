import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function listFiles(directory: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path, extensions)))
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(path)
    }
  }
  return files
}

describe('M3 package boundaries', () => {
  it('keeps Provider hosts and API key handling out of browser source', async () => {
    const files = await listFiles(join(repositoryRoot, 'apps', 'web', 'src'), ['.ts', '.vue'])
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(/api\.openai\.com|dashscope\.aliyuncs\.com|api\.deepseek\.com|api\.siliconflow\.cn/i)
      expect(content).not.toMatch(/localStorage|sessionStorage|indexedDB.*apiKey|apiKey.*indexedDB/i)
    }
  })

  it('keeps candidate persistence out of export and API packages', async () => {
    const exportFiles = await listFiles(join(repositoryRoot, 'packages', 'document-export', 'src'), ['.ts'])
    const apiFiles = await listFiles(join(repositoryRoot, 'apps', 'api', 'src'), ['.ts'])
    for (const file of exportFiles) {
      expect(await readFile(file, 'utf8')).not.toMatch(/@youju\/ai-core|AiCandidate|aiCandidates/)
    }
    for (const file of apiFiles) {
      expect(await readFile(file, 'utf8')).not.toMatch(/@youju\/(?:evidence-[\w-]+|document-export|timeline|ai-repository)/)
      expect(await readFile(file, 'utf8')).not.toMatch(/(?:prisma|typeorm|sequelize|redis|bullmq|s3|object-storage)/i)
    }
  })

  it('keeps Mock-only tests free of public Provider requests and source penetration', async () => {
    const files = [
      ...(await listFiles(join(repositoryRoot, 'tests'), ['.ts'])),
      ...(await listFiles(join(repositoryRoot, 'scripts'), ['.ts'])),
    ]
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(/api\.openai\.com|dashscope\.aliyuncs\.com|api\.deepseek\.com|api\.siliconflow\.cn/i)
      expect(content).not.toMatch(/from ['"][^'"]*packages\/[^'"]*\/src\//)
    }
  })
})
