import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { YOUJU_DATABASE_VERSION } from '../apps/web/src/storage/database-schema.js'
import { CASE_SCHEMA_VERSION } from '../apps/web/src/services/case-service.js'
import { PUBLIC_DEMO_FIXTURE_ID } from '../apps/web/src/demo/demo-fixture.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseJsonPath = join(repositoryRoot, 'apps', 'web', 'dist', 'release.json')

const RELEASE_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/

function currentCommit(): string {
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function buildTime(): string {
  return new Date().toISOString()
}

async function main(): Promise<void> {
  const commit = currentCommit()
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`unexpected commit hash: ${commit}`)
  }
  const builtAt = buildTime()
  const datePart = builtAt.slice(0, 10).replaceAll('-', '.')
  const releaseId = `${datePart}-${commit.slice(0, 7)}`
  if (!RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error(`generated release ID is invalid: ${releaseId}`)
  }

  const descriptor = {
    releaseId,
    commit,
    builtAt,
    indexedDbVersion: YOUJU_DATABASE_VERSION,
    caseSchemaVersion: CASE_SCHEMA_VERSION,
    demoFixtureId: PUBLIC_DEMO_FIXTURE_ID,
  }
  mkdirSync(dirname(releaseJsonPath), { recursive: true })
  writeFileSync(releaseJsonPath, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8')
  console.log(`release descriptor written: ${releaseJsonPath}`)
}

await main()
