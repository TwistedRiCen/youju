import { ExtractFactsWireOutputSchema } from '@youju/ai-core'
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

const UUID_V4_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

export const GoldenCaseManifestSchema = Type.Object(
  {
    id: Type.String({ pattern: '^case-[0-9]{3}-[a-z0-9-]+$' }),
    fictional: Type.Literal(true),
    scenarioType: ScenarioTypeSchema,
    title: Type.String({ minLength: 1 }),
    schemaVersion: SchemaVersionSchema,
    binaryEvidence: Type.Array(
      Type.Object(
        {
          evidenceId: Type.String({ pattern: UUID_V4_PATTERN }),
          relativePath: Type.String({
            pattern: '^binary/[0-9]{2}-[a-z0-9-]+[.](?:png|pdf)$',
          }),
          mediaType: Type.Union([Type.Literal('image/png'), Type.Literal('application/pdf')]),
          size: Type.Integer({ minimum: 1 }),
          sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
        },
        { additionalProperties: false },
      ),
      { minItems: 4, maxItems: 4 },
    ),
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
    aiExtraction: ExtractFactsWireOutputSchema,
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
