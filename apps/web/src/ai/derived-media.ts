import { sha256Hex } from '@youju/evidence-hash'
import type { UuidV4 } from '@youju/domain'

const MAX_EDGE = 2048
const MAX_PIXELS = 4_000_000
const MAX_BYTES = 2 * 1024 * 1024
const QUALITIES = [0.82, 0.74, 0.66, 0.6] as const

export interface DerivedMedia {
  readonly sourceToken: UuidV4
  readonly evidenceId: UuidV4
  readonly page: number
  readonly mediaType: 'image/webp'
  readonly width: number
  readonly height: number
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly previewUrl: string
}

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const edgeScale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const pixelScale = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)))
  const scale = Math.min(edgeScale, pixelScale)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('image_encode_failed'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

export async function deriveImagePage(input: {
  readonly evidenceId: UuidV4
  readonly source: Blob
  readonly page: number
  readonly signal: AbortSignal
  readonly sourceToken: UuidV4
}): Promise<DerivedMedia> {
  checkAborted(input.signal)
  const bitmap = await createImageBitmap(input.source)
  let previewUrl: string | undefined
  try {
    checkAborted(input.signal)
    const size = targetSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('canvas_context_unavailable')
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height)

    let encoded: Blob | undefined
    for (const quality of QUALITIES) {
      checkAborted(input.signal)
      const candidate = await encodeCanvas(canvas, quality)
      if (candidate.size <= MAX_BYTES) {
        encoded = candidate
        break
      }
    }
    if (encoded === undefined) {
      throw new Error('derived_image_too_large')
    }
    checkAborted(input.signal)
    const bytes = new Uint8Array(await encoded.arrayBuffer())
    previewUrl = URL.createObjectURL(encoded)
    return {
      sourceToken: input.sourceToken,
      evidenceId: input.evidenceId,
      page: input.page,
      mediaType: 'image/webp',
      width: size.width,
      height: size.height,
      bytes,
      sha256: await sha256Hex([bytes]),
      previewUrl,
    }
  } catch (error) {
    if (previewUrl !== undefined) {
      URL.revokeObjectURL(previewUrl)
    }
    throw error
  } finally {
    bitmap.close()
  }
}

export function releaseDerivedMedia(media: readonly DerivedMedia[]): void {
  for (const item of media) {
    URL.revokeObjectURL(item.previewUrl)
    item.bytes.fill(0)
  }
}
