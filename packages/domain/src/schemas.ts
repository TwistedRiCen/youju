import { Type } from '@sinclair/typebox'
import type { Static, TProperties } from '@sinclair/typebox'

const UUID_V4_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
const CALENDAR_DATE_PATTERN =
  '(?:(?:[0-9]{4}-(?:(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01]))|(?:(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30))|(?:02-(?:0[1-9]|1[0-9]|2[0-8]))))|(?:(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29))'
const UTC_TIMESTAMP_PATTERN = `^${CALENDAR_DATE_PATTERN}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,3})?Z$`
const SHA256_PATTERN = '^[0-9a-f]{64}$'
const FIXED_POINT_AMOUNT_PATTERN = '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?$'

export const UuidV4Schema = Type.String({ pattern: UUID_V4_PATTERN })
export const UtcTimestampSchema = Type.String({ pattern: UTC_TIMESTAMP_PATTERN })
export const SchemaVersionSchema = Type.Integer({ minimum: 1 })
export const MoneyAmountSchema = Type.Union([
  Type.Integer({ minimum: 0 }),
  Type.String({ pattern: FIXED_POINT_AMOUNT_PATTERN }),
])

export const ScenarioTypeSchema = Type.Literal('ecommerce_refund')
export const CaseStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('in_progress'),
  Type.Literal('ready_to_export'),
  Type.Literal('exported'),
])
export const ReviewStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('confirmed'),
  Type.Literal('edited_and_confirmed'),
  Type.Literal('rejected'),
  Type.Literal('conflicted'),
])
export const TimePrecisionSchema = Type.Union([
  Type.Literal('minute'),
  Type.Literal('date'),
  Type.Literal('approximate'),
  Type.Literal('unknown'),
])

export const EvidenceCategorySchema = Type.Union([
  Type.Literal('order_record'),
  Type.Literal('payment_record'),
  Type.Literal('product_description'),
  Type.Literal('product_issue_photo'),
  Type.Literal('merchant_communication'),
  Type.Literal('after_sales_record'),
  Type.Literal('logistics_record'),
  Type.Literal('invoice_or_contract'),
  Type.Literal('user_statement'),
  Type.Literal('other'),
])
export const EvidenceMediaTypeSchema = Type.Union([
  Type.Literal('image/jpeg'),
  Type.Literal('image/png'),
  Type.Literal('image/webp'),
  Type.Literal('application/pdf'),
  Type.Literal('text/plain'),
])

export const FactTypeSchema = Type.Union([
  Type.Literal('order'),
  Type.Literal('payment'),
  Type.Literal('merchant'),
  Type.Literal('product'),
  Type.Literal('delivery'),
  Type.Literal('issue'),
  Type.Literal('communication'),
  Type.Literal('resolution'),
])
export const FactFieldNameSchema = Type.Union([
  Type.Literal('purchase_time'),
  Type.Literal('merchant_name'),
  Type.Literal('product_name'),
  Type.Literal('paid_amount'),
  Type.Literal('problem_description'),
  Type.Literal('requested_resolution'),
  Type.Literal('order_number'),
  Type.Literal('platform_name'),
  Type.Literal('received_time'),
  Type.Literal('merchant_response'),
])
export const ConfidenceLevelSchema = Type.Union([
  Type.Literal('high'),
  Type.Literal('medium'),
  Type.Literal('low'),
  Type.Literal('unknown'),
])
export const FactOriginSchema = Type.Union([Type.Literal('ai'), Type.Literal('rule')])

const NonMonetaryFactTypeSchema = Type.Union([
  Type.Literal('order'),
  Type.Literal('merchant'),
  Type.Literal('product'),
  Type.Literal('delivery'),
  Type.Literal('issue'),
  Type.Literal('communication'),
  Type.Literal('resolution'),
])
export const SourceReferenceSchema = Type.Object(
  {
    evidenceId: UuidV4Schema,
  },
  { additionalProperties: false },
)

export const CaseEventSchema = Type.Object(
  {
    id: UuidV4Schema,
    scenarioType: ScenarioTypeSchema,
    title: Type.String({ minLength: 1 }),
    createdAt: UtcTimestampSchema,
    updatedAt: UtcTimestampSchema,
    status: CaseStatusSchema,
    requestedResolution: Type.Union([Type.String(), Type.Null()]),
    storageMode: Type.Literal('local'),
    schemaVersion: SchemaVersionSchema,
  },
  { additionalProperties: false },
)

export const EvidenceFileSchema = Type.Object(
  {
    id: UuidV4Schema,
    caseId: UuidV4Schema,
    originalName: Type.String({ minLength: 1 }),
    mediaType: EvidenceMediaTypeSchema,
    size: Type.Integer({ minimum: 0 }),
    sha256: Type.String({ pattern: SHA256_PATTERN }),
    importedAt: UtcTimestampSchema,
    sourceCreatedAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    category: EvidenceCategorySchema,
    storageRef: Type.String({ minLength: 1 }),
    isOriginalPreserved: Type.Boolean(),
    metadata: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
)

const candidateCommonProperties = {
  id: UuidV4Schema,
  caseId: UuidV4Schema,
  confidenceLevel: ConfidenceLevelSchema,
  reviewStatus: ReviewStatusSchema,
  createdAt: UtcTimestampSchema,
}
const aiCandidateProvenanceProperties = {
  origin: Type.Literal('ai'),
  sourceRefs: Type.Array(SourceReferenceSchema, { minItems: 1 }),
  analysisVersionId: UuidV4Schema,
}
const ruleCandidateProvenanceProperties = {
  origin: Type.Literal('rule'),
  sourceRefs: Type.Array(SourceReferenceSchema),
  analysisVersionId: Type.Null(),
}
const paymentCandidateProperties = {
  factType: Type.Literal('payment'),
  fieldName: Type.Literal('paid_amount'),
  value: Type.String({ pattern: FIXED_POINT_AMOUNT_PATTERN }),
  normalizedValue: Type.String({ pattern: '^(?:0|[1-9][0-9]*)$' }),
}
const orderCandidateProperties = {
  factType: Type.Literal('order'),
  fieldName: Type.Union([
    Type.Literal('purchase_time'),
    Type.Literal('order_number'),
    Type.Literal('platform_name'),
  ]),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const merchantCandidateProperties = {
  factType: Type.Literal('merchant'),
  fieldName: Type.Literal('merchant_name'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const productCandidateProperties = {
  factType: Type.Literal('product'),
  fieldName: Type.Literal('product_name'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const deliveryCandidateProperties = {
  factType: Type.Literal('delivery'),
  fieldName: Type.Literal('received_time'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const issueCandidateProperties = {
  factType: Type.Literal('issue'),
  fieldName: Type.Literal('problem_description'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const communicationCandidateProperties = {
  factType: Type.Literal('communication'),
  fieldName: Type.Literal('merchant_response'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}
const resolutionCandidateProperties = {
  factType: Type.Literal('resolution'),
  fieldName: Type.Literal('requested_resolution'),
  value: Type.String({ minLength: 1 }),
  normalizedValue: Type.String({ minLength: 1 }),
}

function createCandidateSchema<
  TProvenance extends TProperties,
  TFactDescriptor extends TProperties,
>(provenance: TProvenance, factDescriptor: TFactDescriptor) {
  return Type.Object(
    { ...candidateCommonProperties, ...provenance, ...factDescriptor },
    { additionalProperties: false },
  )
}

export const FactCandidateSchema = Type.Union([
  createCandidateSchema(aiCandidateProvenanceProperties, paymentCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, orderCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, merchantCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, productCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, deliveryCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, issueCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, communicationCandidateProperties),
  createCandidateSchema(aiCandidateProvenanceProperties, resolutionCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, paymentCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, orderCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, merchantCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, productCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, deliveryCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, issueCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, communicationCandidateProperties),
  createCandidateSchema(ruleCandidateProvenanceProperties, resolutionCandidateProperties),
])

export const ConfirmationMethodSchema = Type.Union([
  Type.Literal('manual'),
  Type.Literal('candidate_confirmed'),
  Type.Literal('candidate_edited'),
])
const confirmedFactCommonProperties = {
  id: UuidV4Schema,
  caseId: UuidV4Schema,
  confirmedAt: UtcTimestampSchema,
}
const manualConfirmationProperties = {
  confirmationMethod: Type.Literal('manual'),
  derivedFromCandidateId: Type.Null(),
  sourceRefs: Type.Array(SourceReferenceSchema),
}
const candidateConfirmationProperties = {
  confirmationMethod: Type.Union([
    Type.Literal('candidate_confirmed'),
    Type.Literal('candidate_edited'),
  ]),
  derivedFromCandidateId: UuidV4Schema,
  sourceRefs: Type.Array(SourceReferenceSchema, { minItems: 1 }),
}
const paymentConfirmedFactProperties = {
  factType: Type.Literal('payment'),
  value: Type.String({ pattern: FIXED_POINT_AMOUNT_PATTERN }),
}
const nonMonetaryConfirmedFactProperties = {
  factType: NonMonetaryFactTypeSchema,
  value: Type.String({ minLength: 1 }),
}

function createConfirmedFactSchema<
  TConfirmation extends TProperties,
  TFactDescriptor extends TProperties,
>(confirmation: TConfirmation, factDescriptor: TFactDescriptor) {
  return Type.Object(
    { ...confirmedFactCommonProperties, ...confirmation, ...factDescriptor },
    { additionalProperties: false },
  )
}

export const ConfirmedFactSchema = Type.Union([
  createConfirmedFactSchema(manualConfirmationProperties, paymentConfirmedFactProperties),
  createConfirmedFactSchema(manualConfirmationProperties, nonMonetaryConfirmedFactProperties),
  createConfirmedFactSchema(candidateConfirmationProperties, paymentConfirmedFactProperties),
  createConfirmedFactSchema(candidateConfirmationProperties, nonMonetaryConfirmedFactProperties),
])

export const TimelineStatusSchema = Type.Union([Type.Literal('draft'), Type.Literal('confirmed')])
export const TimelineEntrySchema = Type.Object(
  {
    id: UuidV4Schema,
    caseId: UuidV4Schema,
    occurredAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    timePrecision: TimePrecisionSchema,
    summary: Type.String({ minLength: 1 }),
    detail: Type.Union([Type.String(), Type.Null()]),
    sourceRefs: Type.Array(SourceReferenceSchema),
    status: TimelineStatusSchema,
    sortOrder: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export const AnalysisStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('running'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
])
export const AnalysisVersionSchema = Type.Object(
  {
    id: UuidV4Schema,
    caseId: UuidV4Schema,
    providerType: Type.Literal('openai_compatible'),
    baseUrlFingerprint: Type.String({ minLength: 1 }),
    modelName: Type.String({ minLength: 1 }),
    promptVersion: Type.String({ minLength: 1 }),
    schemaVersion: SchemaVersionSchema,
    startedAt: UtcTimestampSchema,
    completedAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    status: AnalysisStatusSchema,
    errorCode: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
)

export type UuidV4 = Static<typeof UuidV4Schema>
export type UtcTimestamp = Static<typeof UtcTimestampSchema>
export type SchemaVersion = Static<typeof SchemaVersionSchema>
export type MoneyAmount = Static<typeof MoneyAmountSchema>
export type ScenarioType = Static<typeof ScenarioTypeSchema>
export type CaseStatus = Static<typeof CaseStatusSchema>
export type ReviewStatus = Static<typeof ReviewStatusSchema>
export type TimePrecision = Static<typeof TimePrecisionSchema>
export type EvidenceCategory = Static<typeof EvidenceCategorySchema>
export type EvidenceMediaType = Static<typeof EvidenceMediaTypeSchema>
export type FactType = Static<typeof FactTypeSchema>
export type FactFieldName = Static<typeof FactFieldNameSchema>
export type ConfidenceLevel = Static<typeof ConfidenceLevelSchema>
export type FactOrigin = Static<typeof FactOriginSchema>
export type SourceReference = Static<typeof SourceReferenceSchema>
export type CaseEvent = Static<typeof CaseEventSchema>
export type EvidenceFile = Static<typeof EvidenceFileSchema>
export type FactCandidate = Static<typeof FactCandidateSchema>
export type ConfirmationMethod = Static<typeof ConfirmationMethodSchema>
export type ConfirmedFact = Static<typeof ConfirmedFactSchema>
export type TimelineStatus = Static<typeof TimelineStatusSchema>
export type TimelineEntry = Static<typeof TimelineEntrySchema>
export type AnalysisStatus = Static<typeof AnalysisStatusSchema>
export type AnalysisVersion = Static<typeof AnalysisVersionSchema>
