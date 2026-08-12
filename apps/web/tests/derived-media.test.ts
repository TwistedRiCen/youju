import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildInputManifest,
  deriveImagePage,
  releaseDerivedMedia,
} from '../src/ai/index.js'

const evidenceId = '00000000-0000-4000-8000-000000000101'
const secondEvidenceId = '00000000-0000-4000-8000-000000000102'
const caseId = '00000000-0000-4000-8000-000000000001'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('browser AI media derivation', () => {
  it('resizes an image and selects the first WebP quality that fits', async () => {
    const qualityCalls: number[] = []
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback, _type?: string, quality?: number) => {
        qualityCalls.push(quality ?? -1)
        callback(new Blob([new Uint8Array(1024)], { type: 'image/webp' }))
      }),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:derived-preview')

    const media = await deriveImagePage({
      evidenceId,
      source: new Blob(['fictional-image'], { type: 'image/png' }),
      page: 1,
      signal: new AbortController().signal,
      sourceToken: '00000000-0000-4000-8000-000000000201',
    })

    expect(media).toMatchObject({
      evidenceId,
      page: 1,
      mediaType: 'image/webp',
      width: 2048,
      height: 1536,
      previewUrl: 'blob:derived-preview',
    })
    expect(media.bytes.byteLength).toBe(1024)
    expect(media.sha256).toHaveLength(64)
    expect(qualityCalls).toEqual([0.82])
  })

  it('fails when the lowest approved quality is still too large', async () => {
    const close = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/webp' }))
      }),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    )

    await expect(
      deriveImagePage({
        evidenceId,
        source: new Blob(['fictional-image'], { type: 'image/png' }),
        page: 1,
        signal: new AbortController().signal,
        sourceToken: '00000000-0000-4000-8000-000000000202',
      }),
    ).rejects.toThrow('derived_image_too_large')
    expect(close).toHaveBeenCalledOnce()
  })

  it('aborts after encoding and closes the bitmap without creating a preview URL', async () => {
    const controller = new AbortController()
    const close = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) => {
        controller.abort()
        callback(new Blob([new Uint8Array([1])], { type: 'image/webp' }))
      }),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close })))

    await expect(
      deriveImagePage({
        evidenceId,
        source: new Blob(['fictional-image'], { type: 'image/png' }),
        page: 1,
        signal: controller.signal,
        sourceToken: '00000000-0000-4000-8000-000000000203',
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(close).toHaveBeenCalledOnce()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('builds a stable manifest order and releases all derived bytes and URLs', () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const first = {
      sourceToken: '00000000-0000-4000-8000-000000000211',
      evidenceId,
      page: 2,
      mediaType: 'image/webp' as const,
      width: 100,
      height: 80,
      bytes: new Uint8Array([1, 2]),
      sha256: 'a'.repeat(64),
      previewUrl: 'blob:first',
    }
    const second = {
      ...first,
      sourceToken: '00000000-0000-4000-8000-000000000212',
      page: 1,
      bytes: new Uint8Array([3, 4, 5]),
      sha256: 'b'.repeat(64),
      previewUrl: 'blob:second',
    }
    const third = {
      ...first,
      sourceToken: '00000000-0000-4000-8000-000000000213',
      evidenceId: secondEvidenceId,
      page: 1,
      bytes: new Uint8Array([6]),
      sha256: 'c'.repeat(64),
      previewUrl: 'blob:third',
    }

    const manifest = buildInputManifest({
      taskId: '00000000-0000-4000-8000-000000000301',
      caseId,
      title: 'Fictional case',
      taskType: 'extract_facts',
      providerPreset: 'openai',
      protocol: 'responses',
      baseUrlFingerprint: 'sha256:provider.example',
      modelName: 'fictional-model',
      selections: [
        { evidenceId, originalName: 'first.png', pages: [first, second] },
        { evidenceId: secondEvidenceId, originalName: 'second.png', pages: [third] },
      ],
    })

    expect(manifest.items.map((item) => item.page)).toEqual([1, 2, 1])
    expect(manifest.items.map((item) => item.sourceToken)).toEqual([
      second.sourceToken,
      first.sourceToken,
      third.sourceToken,
    ])
    expect(manifest.totalDerivedBytes).toBe(6)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.items)).toBe(true)

    releaseDerivedMedia([first, second, third])

    expect(first.bytes).toEqual(new Uint8Array([0, 0]))
    expect(second.bytes).toEqual(new Uint8Array([0, 0, 0]))
    expect(third.bytes).toEqual(new Uint8Array([0]))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:third')
  })

})
