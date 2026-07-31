import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const DEFAULT_CHUNK_SIZE = 1024 * 1024

export async function sha256Hex(
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<string> {
  const hash = sha256.create()
  for await (const chunk of chunks) {
    hash.update(chunk)
  }
  return bytesToHex(hash.digest())
}

export async function sha256Blob(blob: Blob, chunkSize?: number): Promise<string> {
  const size = chunkSize ?? DEFAULT_CHUNK_SIZE
  if (size <= 0) {
    throw new Error('invalid_chunk_size')
  }

  const hash = sha256.create()
  let offset = 0
  while (offset < blob.size) {
    const end = Math.min(offset + size, blob.size)
    const chunk = await blob.slice(offset, end).arrayBuffer()
    hash.update(new Uint8Array(chunk))
    offset = end
  }
  return bytesToHex(hash.digest())
}
