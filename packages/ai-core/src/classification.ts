import { EvidenceCategorySchema, UuidV4Schema } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { AiConfidenceLevelSchema } from './source-location.js'

export const EvidenceClassificationSchema = Type.Object(
  {
    evidenceId: UuidV4Schema,
    category: EvidenceCategorySchema,
    confidenceLevel: AiConfidenceLevelSchema,
  },
  { additionalProperties: false },
)

export const ClassifyEvidenceResultSchema = Type.Object(
  {
    analysisVersionId: UuidV4Schema,
    classifications: Type.Array(EvidenceClassificationSchema),
    warnings: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

export type EvidenceClassification = Static<typeof EvidenceClassificationSchema>
export type ClassifyEvidenceResult = Static<typeof ClassifyEvidenceResultSchema>

export function isClassifyEvidenceResult(value: unknown): value is ClassifyEvidenceResult {
  return Value.Check(ClassifyEvidenceResultSchema, value)
}
