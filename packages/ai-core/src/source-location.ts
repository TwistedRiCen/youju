import { UuidV4Schema } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'

export const AiConfidenceLevelSchema = Type.Union([
  Type.Literal('high'),
  Type.Literal('needs_confirmation'),
  Type.Literal('conflicted'),
  Type.Literal('unknown'),
])

export const SourceRegionSchema = Type.Object(
  {
    x: Type.Integer({ minimum: 0 }),
    y: Type.Integer({ minimum: 0 }),
    width: Type.Integer({ minimum: 0 }),
    height: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export const SourceLocationSchema = Type.Object(
  {
    evidenceId: UuidV4Schema,
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    region: Type.Optional(SourceRegionSchema),
  },
  { additionalProperties: false },
)

export type AiConfidenceLevel = Static<typeof AiConfidenceLevelSchema>
export type SourceRegion = Static<typeof SourceRegionSchema>
export type SourceLocation = Static<typeof SourceLocationSchema>
