import {
  AnalysisProtocolSchema,
  AnalysisProviderPresetSchema,
  AnalysisTaskTypeSchema,
  UuidV4Schema,
} from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

const MAX_MATERIALS = 10
const MAX_PAGES = 30
const MAX_DERIVED_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_BATCH_BYTES = 20 * 1024 * 1024
const MAX_TASK_BYTES = 60 * 1024 * 1024
const SHA256_PATTERN = '^[0-9a-f]{64}$'

export const AI_INPUT_LIMITS = Object.freeze({
  maxMaterials: MAX_MATERIALS,
  maxPages: MAX_PAGES,
  maxDerivedImageBytes: MAX_DERIVED_IMAGE_BYTES,
  maxBatchBytes: MAX_BATCH_BYTES,
  maxTaskBytes: MAX_TASK_BYTES,
})

export const InputManifestItemSchema = Type.Object(
  {
    sourceToken: UuidV4Schema,
    evidenceId: UuidV4Schema,
    originalName: Type.String({ minLength: 1 }),
    page: Type.Integer({ minimum: 1 }),
    derivedMediaType: Type.Literal('image/webp'),
    pixelWidth: Type.Integer({ minimum: 1 }),
    pixelHeight: Type.Integer({ minimum: 1 }),
    byteSize: Type.Integer({ minimum: 0 }),
    derivedSha256: Type.String({ pattern: SHA256_PATTERN }),
  },
  { additionalProperties: false },
)

export const InputManifestSchema = Type.Object(
  {
    taskId: UuidV4Schema,
    caseId: UuidV4Schema,
    title: Type.String({ minLength: 1 }),
    taskType: AnalysisTaskTypeSchema,
    providerPreset: AnalysisProviderPresetSchema,
    protocol: AnalysisProtocolSchema,
    baseUrlFingerprint: Type.String({ minLength: 1 }),
    modelName: Type.String({ minLength: 1 }),
    items: Type.Array(InputManifestItemSchema, { minItems: 1 }),
    batchCount: Type.Integer({ minimum: 1 }),
    totalDerivedBytes: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export const WireInputManifestItemSchema = Type.Object(
  {
    sourceToken: UuidV4Schema,
    page: Type.Integer({ minimum: 1 }),
    derivedMediaType: Type.Literal('image/webp'),
    pixelWidth: Type.Integer({ minimum: 1 }),
    pixelHeight: Type.Integer({ minimum: 1 }),
    byteSize: Type.Integer({ minimum: 0 }),
    derivedSha256: Type.String({ pattern: SHA256_PATTERN }),
  },
  { additionalProperties: false },
)

export const WireInputManifestSchema = Type.Object(
  {
    taskId: UuidV4Schema,
    taskType: AnalysisTaskTypeSchema,
    providerPreset: AnalysisProviderPresetSchema,
    protocol: AnalysisProtocolSchema,
    baseUrlFingerprint: Type.String({ minLength: 1 }),
    modelName: Type.String({ minLength: 1 }),
    items: Type.Array(WireInputManifestItemSchema, { minItems: 1 }),
    batchCount: Type.Integer({ minimum: 1 }),
    totalDerivedBytes: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export const WireManifestBatchSchema = Type.Object(
  {
    batchIndex: Type.Integer({ minimum: 0 }),
    batchCount: Type.Integer({ minimum: 1 }),
    items: Type.Array(WireInputManifestItemSchema, { minItems: 1 }),
    totalDerivedBytes: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
)

export type InputManifestItem = Static<typeof InputManifestItemSchema>
export type InputManifest = Static<typeof InputManifestSchema>
export type WireInputManifestItem = Static<typeof WireInputManifestItemSchema>
export type WireInputManifest = Static<typeof WireInputManifestSchema>
export type WireManifestBatch = Static<typeof WireManifestBatchSchema>

function inputManifestError(code: string): Error {
  return new Error(code)
}

function wireItems(manifest: InputManifest): WireInputManifestItem[] {
  return manifest.items.map(({ sourceToken, page, derivedMediaType, pixelWidth, pixelHeight, byteSize, derivedSha256 }) => ({
    sourceToken,
    page,
    derivedMediaType,
    pixelWidth,
    pixelHeight,
    byteSize,
    derivedSha256,
  }))
}

function calculateBatches(items: readonly InputManifestItem[]): WireManifestBatch[] {
  const batches: WireManifestBatch[] = []
  let currentItems: WireInputManifestItem[] = []
  let currentBytes = 0

  for (const item of items) {
    if (currentItems.length > 0 && currentBytes + item.byteSize > MAX_BATCH_BYTES) {
      batches.push({
        batchIndex: batches.length,
        batchCount: 0,
        items: currentItems,
        totalDerivedBytes: currentBytes,
      })
      currentItems = []
      currentBytes = 0
    }

    currentItems.push({
      sourceToken: item.sourceToken,
      page: item.page,
      derivedMediaType: item.derivedMediaType,
      pixelWidth: item.pixelWidth,
      pixelHeight: item.pixelHeight,
      byteSize: item.byteSize,
      derivedSha256: item.derivedSha256,
    })
    currentBytes += item.byteSize
  }

  if (currentItems.length > 0) {
    batches.push({
      batchIndex: batches.length,
      batchCount: 0,
      items: currentItems,
      totalDerivedBytes: currentBytes,
    })
  }

  return batches.map((batch) => ({ ...batch, batchCount: batches.length }))
}

export function validateInputManifest(manifest: unknown): asserts manifest is InputManifest {
  if (!Value.Check(InputManifestSchema, manifest)) {
    throw inputManifestError('invalid_input_manifest')
  }

  const typedManifest = manifest as InputManifest
  const materialIds = new Set(typedManifest.items.map((item) => item.evidenceId))
  const sourceTokens = new Set<string>()

  if (materialIds.size > MAX_MATERIALS) {
    throw inputManifestError('too_many_materials')
  }
  if (typedManifest.items.length > MAX_PAGES) {
    throw inputManifestError('too_many_pages')
  }

  for (const item of typedManifest.items) {
    if (sourceTokens.has(item.sourceToken)) {
      throw inputManifestError('duplicate_source_token')
    }
    sourceTokens.add(item.sourceToken)

    if (item.byteSize > MAX_DERIVED_IMAGE_BYTES) {
      throw inputManifestError('image_too_large')
    }
  }

  if (typedManifest.totalDerivedBytes > MAX_TASK_BYTES) {
    throw inputManifestError('task_too_large')
  }

  const calculatedTotal = typedManifest.items.reduce((total, item) => total + item.byteSize, 0)
  if (calculatedTotal !== typedManifest.totalDerivedBytes) {
    throw inputManifestError('invalid_total_derived_bytes')
  }

  const batches = calculateBatches(typedManifest.items)
  if (typedManifest.batchCount === 1 && typedManifest.totalDerivedBytes > MAX_BATCH_BYTES) {
    throw inputManifestError('batch_too_large')
  }
  if (batches.length !== typedManifest.batchCount) {
    throw inputManifestError('invalid_batch_count')
  }
}

export function toWireInputManifest(manifest: unknown): WireInputManifest {
  validateInputManifest(manifest)
  const typedManifest = manifest as InputManifest
  return {
    taskId: typedManifest.taskId,
    taskType: typedManifest.taskType,
    providerPreset: typedManifest.providerPreset,
    protocol: typedManifest.protocol,
    baseUrlFingerprint: typedManifest.baseUrlFingerprint,
    modelName: typedManifest.modelName,
    items: wireItems(typedManifest),
    batchCount: typedManifest.batchCount,
    totalDerivedBytes: typedManifest.totalDerivedBytes,
  }
}

export function splitManifestBatches(manifest: unknown): readonly WireManifestBatch[] {
  validateInputManifest(manifest)
  return calculateBatches((manifest as InputManifest).items)
}

export function estimateTextTokens(text: string): number {
  if (text.length === 0) {
    return 0
  }
  return Math.ceil(text.length / 4)
}
