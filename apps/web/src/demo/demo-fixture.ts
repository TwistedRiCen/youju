import {
  CaseStatusSchema,
  EvidenceCategorySchema,
  EvidenceMediaTypeSchema,
  FactFieldNameSchema,
  FactTypeSchema,
  ScenarioTypeSchema,
  TimePrecisionSchema,
  UtcTimestampSchema,
} from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const PUBLIC_DEMO_FIXTURE_ID = 'm4-ecommerce-refund-demo-v1'
export const PUBLIC_DEMO_MAX_ASSET_BYTES = 2 * 1024 * 1024

const TemplateTokenSchema = Type.String({ pattern: '^[a-z][a-z0-9-]{2,63}$' })
const Sha256Schema = Type.String({ pattern: '^[0-9a-f]{64}$' })
const BinaryAssetPathSchema = Type.String({
  pattern: '^binary/[a-z0-9][a-z0-9.-]*[.](?:png|pdf)$',
})
const EvidenceMetadataPathSchema = Type.String({
  pattern: '^evidence/[a-z0-9][a-z0-9.-]*[.]json$',
})

export const PublicDemoCaseTemplateSchema = Type.Object(
  {
    token: TemplateTokenSchema,
    scenarioType: ScenarioTypeSchema,
    title: Type.String({ minLength: 1, maxLength: 120 }),
    createdAt: UtcTimestampSchema,
    updatedAt: UtcTimestampSchema,
    status: CaseStatusSchema,
    requestedResolution: Type.String({ minLength: 1, maxLength: 500 }),
    storageMode: Type.Literal('local'),
    schemaVersion: Type.Literal(2),
    dataOrigin: Type.Literal('fictional_demo'),
    demoFixtureId: Type.Literal(PUBLIC_DEMO_FIXTURE_ID),
  },
  { additionalProperties: false },
)

export const PublicDemoEvidenceTemplateSchema = Type.Object(
  {
    token: TemplateTokenSchema,
    caseToken: TemplateTokenSchema,
    originalName: Type.String({ minLength: 1, maxLength: 255 }),
    mediaType: EvidenceMediaTypeSchema,
    size: Type.Integer({ minimum: 1 }),
    sha256: Sha256Schema,
    importedAt: UtcTimestampSchema,
    sourceCreatedAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    category: EvidenceCategorySchema,
    assetPath: BinaryAssetPathSchema,
    metadataPath: EvidenceMetadataPathSchema,
    description: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
)

export const PublicDemoFactTemplateSchema = Type.Object(
  {
    token: TemplateTokenSchema,
    caseToken: TemplateTokenSchema,
    factType: FactTypeSchema,
    fieldName: FactFieldNameSchema,
    value: Type.String({ minLength: 1, maxLength: 1000 }),
    sourceTokens: Type.Array(TemplateTokenSchema, { minItems: 1, uniqueItems: true }),
    confirmedAt: UtcTimestampSchema,
    confirmationMethod: Type.Literal('manual'),
    version: Type.Literal(1),
  },
  { additionalProperties: false },
)

export const PublicDemoTimelineTemplateSchema = Type.Object(
  {
    token: TemplateTokenSchema,
    caseToken: TemplateTokenSchema,
    occurredAt: Type.Union([UtcTimestampSchema, Type.Null()]),
    timePrecision: TimePrecisionSchema,
    summary: Type.String({ minLength: 1, maxLength: 200 }),
    detail: Type.String({ minLength: 1, maxLength: 2000 }),
    sourceTokens: Type.Array(TemplateTokenSchema, { minItems: 1, uniqueItems: true }),
    contentOrigin: Type.Literal('manual'),
    status: Type.Literal('confirmed'),
    sortOrder: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export const PublicDemoStatementTemplateSchema = Type.Object(
  {
    token: TemplateTokenSchema,
    caseToken: TemplateTokenSchema,
    content: Type.String({ minLength: 1, maxLength: 5000 }),
    factTokens: Type.Array(TemplateTokenSchema, { minItems: 1, uniqueItems: true }),
    timelineTokens: Type.Array(TemplateTokenSchema, { minItems: 1, uniqueItems: true }),
    confirmedAt: UtcTimestampSchema,
    confirmationMethod: Type.Literal('manual'),
  },
  { additionalProperties: false },
)

export const PublicDemoFixtureManifestSchema = Type.Object(
  {
    fixtureId: Type.Literal(PUBLIC_DEMO_FIXTURE_ID),
    fixtureVersion: Type.Literal(1),
    fictional: Type.Literal(true),
    case: PublicDemoCaseTemplateSchema,
    evidence: Type.Array(PublicDemoEvidenceTemplateSchema, { minItems: 1 }),
    facts: Type.Array(PublicDemoFactTemplateSchema, { minItems: 1 }),
    timeline: Type.Array(PublicDemoTimelineTemplateSchema, { minItems: 1 }),
    statement: PublicDemoStatementTemplateSchema,
  },
  { additionalProperties: false },
)

export const PublicDemoEvidenceDocumentSchema = Type.Object(
  {
    fixtureId: Type.Literal(PUBLIC_DEMO_FIXTURE_ID),
    fictional: Type.Literal(true),
    evidence: PublicDemoEvidenceTemplateSchema,
  },
  { additionalProperties: false },
)

export type PublicDemoFixtureManifest = Static<typeof PublicDemoFixtureManifestSchema>
export type PublicDemoEvidenceDocument = Static<typeof PublicDemoEvidenceDocumentSchema>
export type PublicDemoAssetReader = (relativePath: string) => Promise<Uint8Array>

const FORBIDDEN_PUBLIC_TEXT_PATTERNS = [
  /(?<!\d)1[3-9]\d{9}(?!\d)/,
  /(?<!\d)\d{17}[\dXx](?!\d)/,
  /(?:api[_-]?key|secret|password)\s*[:=]/i,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /(?:省|市|区|县|路|街|号|室)\s*\d{1,5}/,
]

const isPrivacySafe = (value: unknown) => {
  const content = JSON.stringify(value)
  return !FORBIDDEN_PUBLIC_TEXT_PATTERNS.some((pattern) => pattern.test(content))
}

const referencesOnly = (references: string[], available: Set<string>) =>
  references.every((reference) => available.has(reference))

const VALID_FACT_FIELDS: Record<
  PublicDemoFixtureManifest['facts'][number]['factType'],
  ReadonlySet<string>
> = {
  payment: new Set(['paid_amount']),
  order: new Set(['purchase_time', 'order_number', 'platform_name']),
  merchant: new Set(['merchant_name']),
  product: new Set(['product_name']),
  delivery: new Set(['received_time']),
  issue: new Set(['problem_description']),
  communication: new Set(['merchant_response']),
  resolution: new Set(['requested_resolution']),
}

const hasValidFactDiscriminators = (manifest: PublicDemoFixtureManifest) =>
  manifest.facts.every(
    ({ factType, fieldName, value }) =>
      VALID_FACT_FIELDS[factType].has(fieldName) &&
      (factType !== 'payment' || /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)),
  )

const hasValidReferences = (manifest: PublicDemoFixtureManifest) => {
  const caseToken = manifest.case.token
  const evidenceTokens = new Set(manifest.evidence.map(({ token }) => token))
  const factTokens = new Set(manifest.facts.map(({ token }) => token))
  const timelineTokens = new Set(manifest.timeline.map(({ token }) => token))
  const allTokens = [
    caseToken,
    ...manifest.evidence.map(({ token }) => token),
    ...manifest.facts.map(({ token }) => token),
    ...manifest.timeline.map(({ token }) => token),
    manifest.statement.token,
  ]

  if (new Set(allTokens).size !== allTokens.length) {
    return false
  }

  if (
    manifest.evidence.some(({ caseToken: reference }) => reference !== caseToken) ||
    manifest.facts.some(
      ({ caseToken: reference, sourceTokens }) =>
        reference !== caseToken || !referencesOnly(sourceTokens, evidenceTokens),
    ) ||
    manifest.timeline.some(
      ({ caseToken: reference, sourceTokens }) =>
        reference !== caseToken || !referencesOnly(sourceTokens, evidenceTokens),
    ) ||
    manifest.statement.caseToken !== caseToken ||
    !referencesOnly(manifest.statement.factTokens, factTokens) ||
    !referencesOnly(manifest.statement.timelineTokens, timelineTokens)
  ) {
    return false
  }

  const assetPaths = manifest.evidence.map(({ assetPath }) => assetPath)
  const metadataPaths = manifest.evidence.map(({ metadataPath }) => metadataPath)
  return (
    new Set(assetPaths).size === assetPaths.length &&
    new Set(metadataPaths).size === metadataPaths.length
  )
}

export function parsePublicDemoFixture(input: unknown): PublicDemoFixtureManifest {
  if (!Value.Check(PublicDemoFixtureManifestSchema, input)) {
    throw new Error('Public demo fixture is invalid')
  }

  if (!hasValidReferences(input) || !hasValidFactDiscriminators(input) || !isPrivacySafe(input)) {
    throw new Error('Public demo fixture is invalid')
  }

  return input
}

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyPublicDemoAssets(
  manifest: PublicDemoFixtureManifest,
  readAsset: PublicDemoAssetReader,
): Promise<{ assetCount: number; totalBytes: number }> {
  const totalBytes = manifest.evidence.reduce((total, evidence) => total + evidence.size, 0)
  if (totalBytes > PUBLIC_DEMO_MAX_ASSET_BYTES) {
    throw new Error('Public demo asset verification failed')
  }

  try {
    for (const evidence of manifest.evidence) {
      const bytes = await readAsset(evidence.assetPath)
      if (bytes.byteLength !== evidence.size || (await sha256Hex(bytes)) !== evidence.sha256) {
        throw new Error('mismatch')
      }
    }
  } catch {
    throw new Error('Public demo asset verification failed')
  }

  return { assetCount: manifest.evidence.length, totalBytes }
}
