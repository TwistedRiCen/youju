import {
  EvidenceCategorySchema,
  TimePrecisionSchema,
  UtcTimestampSchema,
  UuidV4Schema,
} from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { AiConfidenceLevelSchema, SourceLocationSchema } from './source-location.js'

export const TimelineCandidateSchema = Type.Object(
  {
    occurredAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    timePrecision: TimePrecisionSchema,
    summary: Type.String({ minLength: 1 }),
    detail: Type.Union([Type.String(), Type.Null()]),
    confidenceLevel: AiConfidenceLevelSchema,
    sources: Type.Array(SourceLocationSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
)

export const BuildTimelineResultSchema = Type.Object(
  {
    analysisVersionId: UuidV4Schema,
    entries: Type.Array(TimelineCandidateSchema),
    uncertainties: Type.Array(Type.String({ minLength: 1 })),
    warnings: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

export const MissingMaterialSuggestionSchema = Type.Object(
  {
    category: EvidenceCategorySchema,
    label: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
    sources: Type.Array(SourceLocationSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
)

export const MissingMaterialResultSchema = Type.Object(
  {
    analysisVersionId: UuidV4Schema,
    suggestions: Type.Array(MissingMaterialSuggestionSchema),
    warnings: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

export type TimelineCandidate = Static<typeof TimelineCandidateSchema>
export type BuildTimelineResult = Static<typeof BuildTimelineResultSchema>
export type MissingMaterialSuggestion = Static<typeof MissingMaterialSuggestionSchema>
export type MissingMaterialResult = Static<typeof MissingMaterialResultSchema>

export function isBuildTimelineResult(value: unknown): value is BuildTimelineResult {
  return Value.Check(BuildTimelineResultSchema, value)
}

export function isMissingMaterialResult(value: unknown): value is MissingMaterialResult {
  return Value.Check(MissingMaterialResultSchema, value)
}
