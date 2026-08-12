import {
  estimateTextTokens,
  splitManifestBatches,
  toWireInputManifest,
  validateInputManifest,
} from '../src/index.js'
import { describe, expect, it } from 'vitest'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'

function item(overrides: Record<string, unknown> = {}) {
  return {
    sourceToken: '00000000-0000-4000-8000-000000000501',
    evidenceId,
    originalName: 'local-order-record.png',
    page: 1,
    derivedMediaType: 'image/webp',
    pixelWidth: 1600,
    pixelHeight: 2200,
    byteSize: 1024,
    derivedSha256: 'a'.repeat(64),
    ...overrides,
  }
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    taskId: '00000000-0000-4000-8000-000000000002',
    caseId,
    title: '虚构事件标题',
    taskType: 'extract_facts',
    providerPreset: 'aliyun_bailian',
    protocol: 'chat_completions',
    baseUrlFingerprint: 'sha256:fixture',
    modelName: 'fixture-model',
    items: [item()],
    batchCount: 1,
    totalDerivedBytes: 1024,
    ...overrides,
  }
}

describe('local input manifest and wire projection', () => {
  it('removes stable local identity and original names from the wire projection', () => {
    const wire = toWireInputManifest(manifest())
    const serialized = JSON.stringify(wire)

    expect(serialized).not.toContain(caseId)
    expect(serialized).not.toContain(evidenceId)
    expect(serialized).not.toContain('虚构事件标题')
    expect(serialized).not.toContain('local-order-record.png')
    expect(wire.items[0]).toEqual({
      sourceToken: '00000000-0000-4000-8000-000000000501',
      page: 1,
      derivedMediaType: 'image/webp',
      pixelWidth: 1600,
      pixelHeight: 2200,
      byteSize: 1024,
      derivedSha256: 'a'.repeat(64),
    })
  })

  it('enforces material, page, image, batch and task limits with stable errors', () => {
    expect(() => validateInputManifest(manifest({
      items: Array.from({ length: 11 }, (_, index) => item({
        sourceToken: `00000000-0000-4000-8000-${String(index + 501).padStart(12, '0')}`,
        evidenceId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      })),
      batchCount: 2,
      totalDerivedBytes: 11264,
    }))).toThrow('too_many_materials')

    expect(() => validateInputManifest(manifest({
      items: Array.from({ length: 31 }, (_, index) => item({
        sourceToken: `00000000-0000-4000-8000-${String(index + 501).padStart(12, '0')}`,
        page: index + 1,
      })),
      batchCount: 2,
      totalDerivedBytes: 31744,
    }))).toThrow('too_many_pages')

    expect(() => validateInputManifest(manifest({
      items: [item({ byteSize: 2 * 1024 * 1024 + 1 })],
      totalDerivedBytes: 2 * 1024 * 1024 + 1,
    }))).toThrow('image_too_large')

    expect(() => validateInputManifest(manifest({
      items: Array.from({ length: 11 }, (_, index) => item({
        sourceToken: `00000000-0000-4000-8000-${String(index + 501).padStart(12, '0')}`,
        page: index + 1,
        byteSize: 2 * 1024 * 1024,
      })),
      batchCount: 1,
      totalDerivedBytes: 22 * 1024 * 1024,
    }))).toThrow('batch_too_large')

    expect(() => validateInputManifest(manifest({
      items: Array.from({ length: 30 }, (_, index) => item({
        sourceToken: `00000000-0000-4000-8000-${String(index + 501).padStart(12, '0')}`,
        page: index + 1,
        byteSize: 2 * 1024 * 1024,
      })),
      batchCount: 4,
      totalDerivedBytes: 60 * 1024 * 1024 + 1,
    }))).toThrow('task_too_large')
  })

  it('splits only between pages while preserving order and batch payload bounds', () => {
    const wireBatches = splitManifestBatches(manifest({
      items: [
        ...Array.from({ length: 10 }, (_, index) => item({
          sourceToken: `00000000-0000-4000-8000-${String(index + 501).padStart(12, '0')}`,
          page: index + 1,
          byteSize: 2 * 1024 * 1024,
        })),
        item({ sourceToken: '00000000-0000-4000-8000-000000000511', page: 11, byteSize: 1 }),
      ],
      batchCount: 2,
      totalDerivedBytes: 20 * 1024 * 1024 + 1,
    }))

    expect(wireBatches).toHaveLength(2)
    expect(wireBatches[0]?.items).toHaveLength(10)
    expect(wireBatches[1]?.items.map(({ sourceToken }) => sourceToken)).toEqual([
      '00000000-0000-4000-8000-000000000511',
    ])
  })

  it('estimates text tokens deterministically without storing input text', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens('12345678')).toBe(2)
    expect(estimateTextTokens('123456789')).toBe(3)
  })
})
