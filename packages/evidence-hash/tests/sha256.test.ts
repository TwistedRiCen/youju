import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256Blob, sha256Hex } from '../src/index.js'

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('incremental SHA-256 hashing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches the known abc vector', async () => {
    await expect(sha256Hex([new TextEncoder().encode('abc')])).resolves.toBe(ABC_SHA256)
  })

  it('accepts async chunk iterables', async () => {
    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('ab')
      yield new TextEncoder().encode('c')
    }

    await expect(sha256Hex(chunks())).resolves.toBe(ABC_SHA256)
  })

  it('produces the same digest for different blob chunk sizes', async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 17).map((_, index) => index % 251)

    await expect(sha256Blob(new Blob([bytes]), 64 * 1024)).resolves.toBe(
      await sha256Blob(new Blob([bytes]), 1024 * 1024),
    )
  })

  it('never reads a blob slice larger than the requested chunk size', async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 17).map((_, index) => index % 251)
    const originalSlice = Blob.prototype.slice
    const sliceSizes: number[] = []

    vi.spyOn(Blob.prototype, 'slice').mockImplementation(function (
      this: Blob,
      start?: number,
      end?: number,
    ) {
      const from = start ?? 0
      const to = end ?? this.size
      sliceSizes.push(to - from)
      return originalSlice.call(this, start, end)
    })

    await sha256Blob(new Blob([bytes]), 64 * 1024)

    expect(sliceSizes.length).toBeGreaterThan(1)
    for (const size of sliceSizes) {
      expect(size).toBeLessThanOrEqual(64 * 1024)
    }
  })

  it('rejects non-positive chunk sizes', async () => {
    await expect(sha256Blob(new Blob(['abc']), 0)).rejects.toThrow('invalid_chunk_size')
  })
})
