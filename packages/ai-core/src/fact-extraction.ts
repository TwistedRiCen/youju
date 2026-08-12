import type { FactFieldName, FactType } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { AiConfidenceLevelSchema, SourceLocationSchema } from './source-location.js'

const FIXED_POINT_AMOUNT_PATTERN = '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?$'
const INTEGER_FEN_PATTERN = '^(?:0|[1-9][0-9]*)$'

const extractedFactCommonProperties = {
  confidenceLevel: AiConfidenceLevelSchema,
  sources: Type.Array(SourceLocationSchema, { minItems: 1 }),
}

function createExtractedFactSchema<TFactType extends FactType, TFieldName extends FactFieldName>(
  factType: TFactType,
  fieldName: TFieldName,
  monetary = false,
) {
  return Type.Object(
    {
      ...extractedFactCommonProperties,
      factType: Type.Literal(factType),
      fieldName: Type.Literal(fieldName),
      value: monetary
        ? Type.String({ pattern: FIXED_POINT_AMOUNT_PATTERN })
        : Type.String({ minLength: 1 }),
      normalizedValue: monetary
        ? Type.String({ pattern: INTEGER_FEN_PATTERN })
        : Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  )
}

export const ExtractedFactSchema = Type.Union([
  createExtractedFactSchema('order', 'purchase_time'),
  createExtractedFactSchema('order', 'order_number'),
  createExtractedFactSchema('order', 'platform_name'),
  createExtractedFactSchema('payment', 'paid_amount', true),
  createExtractedFactSchema('merchant', 'merchant_name'),
  createExtractedFactSchema('product', 'product_name'),
  createExtractedFactSchema('delivery', 'received_time'),
  createExtractedFactSchema('issue', 'problem_description'),
  createExtractedFactSchema('communication', 'merchant_response'),
  createExtractedFactSchema('resolution', 'requested_resolution'),
])

export const ExtractFactsResultSchema = Type.Object(
  {
    facts: Type.Array(ExtractedFactSchema),
    uncertainties: Type.Array(Type.String({ minLength: 1 })),
    warnings: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

export type ExtractedFact = Static<typeof ExtractedFactSchema>
export type ExtractFactsResult = Static<typeof ExtractFactsResultSchema>

export function isExtractFactsResult(value: unknown): value is ExtractFactsResult {
  return Value.Check(ExtractFactsResultSchema, value)
}
