import { UuidV4Schema } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const DraftStatementRequestSchema = Type.Object(
  {
    confirmedFactIds: Type.Array(UuidV4Schema, { minItems: 1, uniqueItems: true }),
  },
  { additionalProperties: false },
)

export const DraftStatementResultSchema = Type.Object(
  {
    analysisVersionId: UuidV4Schema,
    text: Type.String({ minLength: 1 }),
    confirmedFactIds: Type.Array(UuidV4Schema, { minItems: 1, uniqueItems: true }),
    warnings: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

export type DraftStatementRequest = Static<typeof DraftStatementRequestSchema>
export type DraftStatementResult = Static<typeof DraftStatementResultSchema>

export function isDraftStatementRequest(value: unknown): value is DraftStatementRequest {
  return Value.Check(DraftStatementRequestSchema, value)
}

export function isDraftStatementResult(value: unknown): value is DraftStatementResult {
  return Value.Check(DraftStatementResultSchema, value)
}
