import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Value } from '@sinclair/typebox/value'
import {
  PUBLIC_DEMO_FIXTURE_ID,
  PublicDemoEvidenceDocumentSchema,
  parsePublicDemoFixture,
  verifyPublicDemoAssets,
} from '../apps/web/src/demo/demo-fixture.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultPublicDemoRoot = join(
  repositoryRoot,
  'apps',
  'web',
  'public',
  'demo',
  PUBLIC_DEMO_FIXTURE_ID,
)

const listFiles = async (directory: string, prefix = ''): Promise<string[]> => {
  const paths: string[] = []
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      paths.push(...(await listFiles(join(directory, entry.name), relativePath)))
    } else {
      paths.push(relativePath)
    }
  }
  return paths
}

export const validatePublicDemoAt = async (publicDemoRoot: string) => {
  const manifest = parsePublicDemoFixture(
    JSON.parse(await readFile(join(publicDemoRoot, 'manifest.json'), 'utf8')),
  )
  if (manifest.evidence.length !== 4) {
    throw new Error('Unexpected public demo evidence count')
  }

  const expectedFiles = [
    'manifest.json',
    ...manifest.evidence.map(({ metadataPath }) => metadataPath),
    ...manifest.evidence.map(({ assetPath }) => assetPath),
  ].sort()
  if (!isDeepStrictEqual(expectedFiles, await listFiles(publicDemoRoot))) {
    throw new Error('Public demo contains missing or unmanaged files')
  }

  for (const evidence of manifest.evidence) {
    const document: unknown = JSON.parse(
      await readFile(join(publicDemoRoot, evidence.metadataPath), 'utf8'),
    )
    if (
      !Value.Check(PublicDemoEvidenceDocumentSchema, document) ||
      !isDeepStrictEqual(document.evidence, evidence)
    ) {
      throw new Error('Public demo evidence metadata is invalid')
    }
  }

  const result = await verifyPublicDemoAssets(manifest, async (relativePath) =>
    readFile(join(publicDemoRoot, relativePath)),
  )
  return { fixtureId: manifest.fixtureId, ...result }
}

const run = async () => {
  const result = await validatePublicDemoAt(defaultPublicDemoRoot)
  process.stdout.write(
    `PASS ${result.fixtureId}: ${result.assetCount} fictional assets, ${result.totalBytes} bytes\n`,
  )
}

const entryPoint = process.argv[1]
if (entryPoint && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  run().catch(() => {
    process.stderr.write('FAIL public demo fixture validation failed\n')
    process.exitCode = 1
  })
}
