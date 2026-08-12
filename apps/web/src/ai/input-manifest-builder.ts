import { AI_INPUT_LIMITS, validateInputManifest } from '@youju/ai-core'
import type { InputManifest, InputManifestItem } from '@youju/ai-core'
import type { AnalysisProtocol, AnalysisProviderPreset, AnalysisTaskType, UuidV4 } from '@youju/domain'
import type { DerivedMedia } from './derived-media.js'

export interface ManifestSelection {
  readonly evidenceId: UuidV4
  readonly originalName: string
  readonly pages: readonly DerivedMedia[]
}

export interface BuildInputManifestInput {
  readonly taskId: UuidV4
  readonly caseId: UuidV4
  readonly title: string
  readonly taskType: AnalysisTaskType
  readonly providerPreset: AnalysisProviderPreset
  readonly protocol: AnalysisProtocol
  readonly baseUrlFingerprint: string
  readonly modelName: string
  readonly selections: readonly ManifestSelection[]
}

export function buildInputManifest(input: BuildInputManifestInput): InputManifest {
  const items: InputManifestItem[] = input.selections.flatMap((selection) =>
    [...selection.pages]
      .sort((left, right) => left.page - right.page)
      .map((media) => ({
        sourceToken: media.sourceToken,
        evidenceId: selection.evidenceId,
        originalName: selection.originalName,
        page: media.page,
        derivedMediaType: media.mediaType,
        pixelWidth: media.width,
        pixelHeight: media.height,
        byteSize: media.bytes.byteLength,
        derivedSha256: media.sha256,
      })),
  )
  if (items.length === 0) {
    throw new Error('no_derived_media')
  }
  let batchCount = 1
  let currentBatchBytes = 0
  for (const item of items) {
    if (
      currentBatchBytes > 0 &&
      currentBatchBytes + item.byteSize > AI_INPUT_LIMITS.maxBatchBytes
    ) {
      batchCount += 1
      currentBatchBytes = 0
    }
    currentBatchBytes += item.byteSize
  }
  const manifest = Object.freeze({
    taskId: input.taskId,
    caseId: input.caseId,
    title: input.title,
    taskType: input.taskType,
    providerPreset: input.providerPreset,
    protocol: input.protocol,
    baseUrlFingerprint: input.baseUrlFingerprint,
    modelName: input.modelName,
    batchCount,
    totalDerivedBytes: items.reduce((total, item) => total + item.byteSize, 0),
    items: Object.freeze(items) as unknown as InputManifest['items'],
  })
  validateInputManifest(manifest)
  return manifest
}
