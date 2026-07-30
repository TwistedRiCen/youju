import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanRepository } from '../../scripts/check-forbidden-content.js'

const temporaryRepositories: string[] = []

const createRepository = async () => {
  const root = await mkdtemp(join(tmpdir(), 'youju-forbidden-content-'))
  temporaryRepositories.push(root)
  return root
}

const writeRepositoryFile = async (root: string, path: string, content: string) => {
  const filePath = join(root, path)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('forbidden content scanner', () => {
  it('reports a secret without including the matched value', async () => {
    const root = await createRepository()
    const secret = 'sk-' + 'a'.repeat(32)
    await writeRepositoryFile(root, 'fixtures/example.json', JSON.stringify({ token: secret }))

    const findings = await scanRepository(root)

    expect(findings).toEqual([
      {
        path: 'fixtures/example.json',
        ruleId: 'openai-secret',
      },
    ])
    expect(JSON.stringify(findings)).not.toContain(secret)
  })

  it('allows normal synthetic content and the environment example template', async () => {
    const root = await createRepository()
    await writeRepositoryFile(root, '.env.example', 'YOUJU_OPTIONAL_KEY=\n')
    await writeRepositoryFile(
      root,
      'fixtures/example.json',
      JSON.stringify({ fictional: true, merchant: '晴川生活示例店' }),
    )

    await expect(scanRepository(root)).resolves.toEqual([])
  })

  it('reports environment files, real-data markers, and mobile-shaped fixture values', async () => {
    const root = await createRepository()
    const englishMarker = 'REAL_' + 'USER_DATA'
    const chineseMarker = '真实用户' + '材料'
    const mobile = '139' + '12345678'
    await writeRepositoryFile(root, '.env.local', 'OPTIONAL_KEY=synthetic\n')
    await writeRepositoryFile(root, 'notes.txt', `${englishMarker}\n${chineseMarker}\n`)
    await writeRepositoryFile(root, 'fixtures/example.json', JSON.stringify({ mobile }))

    const findings = await scanRepository(root)

    expect(findings).toEqual([
      { path: '.env.local', ruleId: 'environment-file' },
      { path: 'fixtures/example.json', ruleId: 'fixture-mainland-mobile' },
      { path: 'notes.txt', ruleId: 'real-user-data-marker' },
      { path: 'notes.txt', ruleId: 'real-user-material-marker' },
    ])
  })
})
