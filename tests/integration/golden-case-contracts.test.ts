import { readFile } from 'node:fs/promises'
import { ExtractFactsWireOutputSchema } from '@youju/ai-core'
import {
  CaseEventSchema,
  ConfirmedFactSchema,
  EvidenceFileSchema,
  TimelineEntrySchema,
} from '@youju/domain'
import { evaluateRule, parseEcommerceRefundRule } from '@youju/rule-engine'
import { loadGoldenCase } from '@youju/test-support'
import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'

const fixtureDirectory = new URL(
  '../../fixtures/ecommerce-refund/case-001-transport-damage/',
  import.meta.url,
)
const rulePath = new URL('../../rules/consumer/ecommerce-refund.v1.yaml', import.meta.url)

describe('golden case cross-package contracts', () => {
  it('validates case 1 and reproduces its exact deterministic findings', async () => {
    const fixture = await loadGoldenCase(fixtureDirectory)
    const rule = parseEcommerceRefundRule(await readFile(rulePath, 'utf8'))

    expect(Value.Check(CaseEventSchema, fixture.case)).toBe(true)
    for (const evidence of fixture.evidence) {
      expect(Value.Check(EvidenceFileSchema, evidence)).toBe(true)
      expect(evidence.caseId).toBe(fixture.case.id)
    }
    for (const confirmedFact of fixture.expected.confirmedFacts) {
      expect(Value.Check(ConfirmedFactSchema, confirmedFact)).toBe(true)
      expect(confirmedFact.caseId).toBe(fixture.case.id)
    }
    for (const timelineEntry of fixture.expected.timeline) {
      expect(Value.Check(TimelineEntrySchema, timelineEntry)).toBe(true)
      expect(timelineEntry.caseId).toBe(fixture.case.id)
    }
    expect(Value.Check(ExtractFactsWireOutputSchema, fixture.expected.aiExtraction)).toBe(true)
    expect(
      fixture.expected.aiExtraction.facts.every((fact) =>
        fact.sources.every((source) => 'sourceToken' in source && !('evidenceId' in source)),
      ),
    ).toBe(true)

    const findings = evaluateRule(rule, {
      confirmedFactFields: fixture.expected.confirmedFactFields,
      evidence: fixture.evidence.map(({ id, category }) => ({ id, category })),
    })

    expect(findings).toEqual(fixture.expected.findings)
  })
})
