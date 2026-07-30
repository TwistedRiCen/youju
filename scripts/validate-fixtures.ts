import { readdir, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { evaluateRule, parseEcommerceRefundRule } from '@youju/rule-engine'
import { loadGoldenCase } from '@youju/test-support'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(repositoryRoot, 'fixtures', 'ecommerce-refund')
const rulePath = join(repositoryRoot, 'rules', 'consumer', 'ecommerce-refund.v1.yaml')

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
      const actualFindings = evaluateRule(rule, {
        confirmedFactFields: fixture.expected.confirmedFactFields,
        evidence: fixture.evidence.map(({ id, category }) => ({ id, category })),
      })

      if (!isDeepStrictEqual(actualFindings, fixture.expected.findings)) {
        throw new Error('Rule findings mismatch')
      }

      process.stdout.write(
        `PASS ${fixture.manifest.id}: ${fixture.evidence.length} evidence, ${fixture.expected.confirmedFacts.length} confirmed facts, ${fixture.expected.timeline.length} timeline entries\n`,
      )
    } catch {
      process.stderr.write(`FAIL ${directoryName}: fixture validation failed\n`)
      process.exitCode = 1
      return
    }
  }

  process.stdout.write(`Validated ${fixtureDirectories.length} golden case.\n`)
}

main().catch(() => {
  process.stderr.write('FAIL fixture validation could not start\n')
  process.exitCode = 1
})
