import { ExtractFactsResultSchema } from '@youju/ai-core'
import {
  CaseEventSchema,
  ConfirmedFactSchema,
  EvidenceFileSchema,
  FactFieldNameSchema,
  ScenarioTypeSchema,
  SchemaVersionSchema,
  TimelineEntrySchema,
} from '@youju/domain'
import { RuleFindingSchema } from '@youju/rule-engine'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const GoldenCaseManifestSchema = Type.Object(
  {
    id: Type.String({ pattern: '^case-[0-9]{3}-[a-z0-9-]+$' }),
    fictional: Type.Literal(true),
    scenarioType: ScenarioTypeSchema,
    title: Type.String({ minLength: 1 }),
    schemaVersion: SchemaVersionSchema,
  },
  { additionalProperties: false },
)

export const GoldenCaseCaseDocumentSchema = Type.Object(
  {
    fictional: Type.Literal(true),
    case: CaseEventSchema,
  },
  { additionalProperties: false },
)

export const GoldenCaseEvidenceDocumentSchema = Type.Object(
  {
    fictional: Type.Literal(true),
    evidence: EvidenceFileSchema,
  },
  { additionalProperties: false },
)

export const GoldenCaseExpectedFactsSchema = Type.Object(
  {
    fictional: Type.Literal(true),
    confirmedFactFields: Type.Array(FactFieldNameSchema, { minItems: 1, uniqueItems: true }),
    confirmedFacts: Type.Array(ConfirmedFactSchema, { minItems: 1 }),
    aiExtraction: ExtractFactsResultSchema,
  },
  { additionalProperties: false },
)

export const GoldenCaseExpectedTimelineSchema = Type.Object(
  {
    fictional: Type.Literal(true),
    timeline: Type.Array(TimelineEntrySchema, { minItems: 1 }),
  },
  { additionalProperties: false },
)

export const GoldenCaseExpectedFindingsSchema = Type.Object(
  {
    fictional: Type.Literal(true),
    findings: Type.Array(RuleFindingSchema),
  },
  { additionalProperties: false },
)

export type GoldenCaseManifest = Static<typeof GoldenCaseManifestSchema>
export type GoldenCaseCaseDocument = Static<typeof GoldenCaseCaseDocumentSchema>
export type GoldenCaseEvidenceDocument = Static<typeof GoldenCaseEvidenceDocumentSchema>
export type GoldenCaseExpectedFacts = Static<typeof GoldenCaseExpectedFactsSchema>
export type GoldenCaseExpectedTimeline = Static<typeof GoldenCaseExpectedTimelineSchema>
export type GoldenCaseExpectedFindings = Static<typeof GoldenCaseExpectedFindingsSchema>

export function isGoldenCaseManifest(value: unknown): value is GoldenCaseManifest {
  return Value.Check(GoldenCaseManifestSchema, value)
}

export function isGoldenCaseExpectedFacts(value: unknown): value is GoldenCaseExpectedFacts {
  return Value.Check(GoldenCaseExpectedFactsSchema, value)
}
