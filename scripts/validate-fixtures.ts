import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { evaluateRule, parseEcommerceRefundRule } from '@youju/rule-engine'
import { loadGoldenCase } from '@youju/test-support'
import { evaluateGoldenCase } from './evaluate-ai-golden-case.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(repositoryRoot, 'fixtures', 'ecommerce-refund')
const rulePath = join(repositoryRoot, 'rules', 'consumer', 'ecommerce-refund.v1.yaml')
const EXPECTED_DEMO_FIXTURE_ID = 'm4-ecommerce-refund-demo-v1'

const forbiddenFixturePatterns = [
  /(?<!\d)1[3-9]\d{9}(?!\d)/,
  /(?<!\d)\d{17}[\dXx](?!\d)/,
  /(?:api[_-]?key|secret|password)\s*[:=]/i,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /(?:省|市|区|县|路|街|号|室)\s*\d{1,5}/,
]

async function listTextFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listTextFiles(path)))
    } else if (/\.(?:json|txt|yaml|yml|md)$/i.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

async function validateFixturePrivacy(directory: string): Promise<void> {
  for (const path of await listTextFiles(directory)) {
    const content = await readFile(path, 'utf8')
    if (forbiddenFixturePatterns.some((pattern) => pattern.test(content))) {
      throw new Error('Fixture contains prohibited personal data or secret-like content')
    }
  }
}

async function main(): Promise<void> {
  const rule = parseEcommerceRefundRule(await readFile(rulePath, 'utf8'))
  const fixtureDirectories = (await readdir(fixtureRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  if (fixtureDirectories.length === 0) {
    throw new Error('No golden cases found')
  }

  for (const directoryName of fixtureDirectories) {
    try {
      const fixture = await loadGoldenCase(join(fixtureRoot, directoryName))
      if (
        fixture.case.dataOrigin !== 'fictional_demo' ||
        fixture.case.demoFixtureId !== EXPECTED_DEMO_FIXTURE_ID
      ) {
        throw new Error('Golden case must declare the approved fictional demo identity')
      }
      const actualFindings = evaluateRule(rule, {
        confirmedFactFields: fixture.expected.confirmedFactFields,
        evidence: fixture.evidence.map(({ id, category }) => ({ id, category })),
      })

      if (!isDeepStrictEqual(actualFindings, fixture.expected.findings)) {
        throw new Error('Rule findings mismatch')
      }

      for (const binary of fixture.binaryEvidence) {
        const bytes = await readFile(join(fixtureRoot, directoryName, binary.relativePath))
        const actualSha256 = createHash('sha256').update(bytes).digest('hex')
        if (bytes.length !== binary.size || actualSha256 !== binary.sha256) {
          throw new Error(`Binary evidence mismatch: ${binary.relativePath}`)
        }
      }

      await validateFixturePrivacy(join(fixtureRoot, directoryName))

      process.stdout.write(
        `PASS ${fixture.manifest.id}: ${fixture.evidence.length} evidence, ${fixture.binaryEvidence.length} binary materials, ${fixture.expected.confirmedFacts.length} confirmed facts, ${fixture.expected.timeline.length} timeline entries\n`,
      )
    } catch {
      process.stderr.write(`FAIL ${directoryName}: fixture validation failed\n`)
      process.exitCode = 1
      return
    }
  }

  await evaluateGoldenCase()

  process.stdout.write(`Validated ${fixtureDirectories.length} golden case.\n`)
}

main().catch(() => {
  process.stderr.write('FAIL fixture validation could not start\n')
  process.exitCode = 1
})
