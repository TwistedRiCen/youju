import { describe, expect, it } from 'vitest'
import {
  goldenCase001Summary,
  isGoldenCaseExpectedFacts,
  isGoldenCaseManifest,
  loadGoldenCase,
} from '../src/index.js'

const fixtureDirectory = new URL(
  '../../../fixtures/ecommerce-refund/case-001-transport-damage/',
  import.meta.url,
)

describe('golden case fixture loader', () => {
  it('loads the complete fictional transport-damage case', async () => {
    const fixture = await loadGoldenCase(fixtureDirectory)

    expect(fixture.manifest).toMatchObject({
      id: 'case-001-transport-damage',
      fictional: true,
      scenarioType: 'ecommerce_refund',
    })
    expect(fixture.evidence).toHaveLength(4)
    expect(fixture.binaryEvidence).toHaveLength(4)
    for (const binary of fixture.binaryEvidence) {
      expect(binary.relativePath).toMatch(/^binary\/[0-9]{2}-[a-z0-9-]+[.](?:png|pdf)$/)
      expect(binary.size).toBeGreaterThan(0)
      expect(binary.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(fixture.expected.confirmedFacts).toHaveLength(6)
    expect(fixture.expected.timeline).toHaveLength(4)
    expect(goldenCase001Summary).toEqual({
      id: fixture.manifest.id,
      title: fixture.manifest.title,
      evidenceCount: fixture.evidence.length,
      binaryCount: fixture.binaryEvidence.length,
      confirmedFactCount: fixture.expected.confirmedFacts.length,
      timelineCount: fixture.expected.timeline.length,
      ruleValidation: 'passed',
    })
  })

  it('rejects a manifest that is not explicitly fictional', async () => {
    const fixture = await loadGoldenCase(fixtureDirectory)

    expect(
      isGoldenCaseManifest({
        ...fixture.manifest,
        fictional: false,
      }),
    ).toBe(false)
  })

  it('rejects binary evidence with unsupported media types', async () => {
    const fixture = await loadGoldenCase(fixtureDirectory)

    expect(
      isGoldenCaseManifest({
        ...fixture.manifest,
        binaryEvidence: fixture.manifest.binaryEvidence.map((binary, index) =>
          index === 0 ? { ...binary, mediaType: 'text/plain' } : binary,
        ),
      }),
    ).toBe(false)
  })

  it('rejects expected AI facts that lose their evidence source', async () => {
    const fixture = await loadGoldenCase(fixtureDirectory)
    const firstAiFact = fixture.expected.aiExtraction.facts[0]

    expect(firstAiFact).toBeDefined()
    expect(
      isGoldenCaseExpectedFacts({
        fictional: true,
        confirmedFactFields: fixture.expected.confirmedFactFields,
        confirmedFacts: fixture.expected.confirmedFacts,
        aiExtraction: {
          ...fixture.expected.aiExtraction,
          facts: [{ ...firstAiFact, sources: [] }, ...fixture.expected.aiExtraction.facts.slice(1)],
        },
      }),
    ).toBe(false)
  })
})
