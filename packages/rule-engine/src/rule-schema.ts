import {
  EvidenceCategorySchema,
  FactFieldNameSchema,
  ScenarioTypeSchema,
  UuidV4Schema,
} from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse } from 'yaml'

const SEMANTIC_VERSION_PATTERN =
  '^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\\+(?:[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$'
const ISO_DATE_PATTERN = '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$'

export const RuleSourceSchema = Type.Object(
  {
    description: Type.String({ minLength: 1 }),
    scope: Type.String({ minLength: 1 }),
    stable: Type.Literal(true),
    lastVerifiedAt: Type.String({ pattern: ISO_DATE_PATTERN }),
    maintainer: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

export const RecommendedEvidenceSchema = Type.Object(
  {
    category: EvidenceCategorySchema,
    label: Type.String({ minLength: 1 }),
    sourceReference: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

export const RuleWarningSchema = Type.Union([
  Type.Literal('preserve_original_files'),
  Type.Literal('preserve_original_device'),
  Type.Literal('avoid_editing_original_screenshots'),
])

export const EcommerceRefundRuleSchema = Type.Object(
  {
    id: Type.Literal('consumer.ecommerce.refund.basic'),
    version: Type.String({ pattern: SEMANTIC_VERSION_PATTERN }),
    scenario: ScenarioTypeSchema,
    source: RuleSourceSchema,
    requiredFacts: Type.Array(FactFieldNameSchema, { minItems: 1, uniqueItems: true }),
    recommendedEvidence: Type.Array(RecommendedEvidenceSchema, {
      minItems: 1,
      uniqueItems: true,
    }),
    warnings: Type.Array(RuleWarningSchema, { minItems: 1, uniqueItems: true }),
  },
  { additionalProperties: false },
)

const ruleFindingCommonProperties = {
  ruleId: Type.String({ minLength: 1 }),
  ruleVersion: Type.String({ pattern: SEMANTIC_VERSION_PATTERN }),
  message: Type.String({ minLength: 1 }),
  relatedEvidenceIds: Type.Array(UuidV4Schema),
  sourceReference: Type.String({ minLength: 1 }),
}

export const RuleFindingSchema = Type.Union([
  Type.Object(
    {
      ...ruleFindingCommonProperties,
      severity: Type.Literal('blocking'),
      resultType: Type.Literal('missing_fact'),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...ruleFindingCommonProperties,
      severity: Type.Literal('warning'),
      resultType: Type.Literal('missing_evidence'),
    },
    { additionalProperties: false },
  ),
])

export type RuleSource = Static<typeof RuleSourceSchema>
export type RecommendedEvidence = Static<typeof RecommendedEvidenceSchema>
export type RuleWarning = Static<typeof RuleWarningSchema>
export type EcommerceRefundRule = Static<typeof EcommerceRefundRuleSchema>
export type RuleFinding = Static<typeof RuleFindingSchema>

export function isEcommerceRefundRule(value: unknown): value is EcommerceRefundRule {
  return Value.Check(EcommerceRefundRuleSchema, value)
}

export function parseEcommerceRefundRule(document: string): EcommerceRefundRule {
  const value: unknown = parse(document)

  if (!isEcommerceRefundRule(value)) {
    throw new Error('Invalid ecommerce refund rule')
  }

  return value
}
