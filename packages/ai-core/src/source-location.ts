import { AiConfidenceLevelSchema, UuidV4Schema } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'

export { AiConfidenceLevelSchema }
export type { AiConfidenceLevel } from '@youju/domain'

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
    sourceToken: UuidV4Schema,
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    region: Type.Optional(SourceRegionSchema),
  },
  { additionalProperties: false },
)

export type SourceRegion = Static<typeof SourceRegionSchema>
export type SourceLocation = Static<typeof SourceLocationSchema>
