import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readJson = async (path: string) =>
  JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >

describe('root workspace configuration', () => {
  it('pins Node 24 and exposes the required quality gates', async () => {
    const packageJson = await readJson('package.json')
    const scripts = packageJson.scripts as Record<string, string>
    const engines = packageJson.engines as Record<string, string>

    expect(engines.node).toBe('>=24 <25')
    expect(scripts).toMatchObject({
      lint: 'eslint .',
      typecheck: 'tsc -p tsconfig.json --noEmit && pnpm -r --if-present typecheck',
      test: 'vitest run',
      'validate:fixtures': 'tsx scripts/validate-fixtures.ts',
      build: 'pnpm -r --if-present build',
      e2e: 'playwright test',
      verify:
        'pnpm lint && pnpm typecheck && pnpm test && pnpm validate:fixtures && pnpm build && pnpm e2e',
    })
  })
})
