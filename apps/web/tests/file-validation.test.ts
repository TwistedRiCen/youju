import { describe, expect, it } from 'vitest'
import {
  MAX_FILES_PER_CASE,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  validateFileInput,
} from '../src/evidence/file-validation.js'
import type { EvidenceImportLimits } from '../src/evidence/file-validation.js'

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

const openLimits: EvidenceImportLimits = {
  currentFileCount: 0,
  currentTotalBytes: 0,
  remainingQuotaBytes: null,
}

describe('deterministic file validation', () => {
  it('accepts matching extension, MIME and signature pairs', () => {
    const cases = [
      { fileName: 'photo.jpg', mimeType: 'image/jpeg', leadingBytes: jpegBytes },
      { fileName: 'photo.jpeg', mimeType: 'image/jpeg', leadingBytes: jpegBytes },
      { fileName: 'photo.png', mimeType: 'image/png', leadingBytes: pngBytes },
      { fileName: 'photo.webp', mimeType: 'image/webp', leadingBytes: webpBytes },
      { fileName: 'doc.pdf', mimeType: 'application/pdf', leadingBytes: pdfBytes },
    ]

    for (const input of cases) {
      expect(
        validateFileInput({
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: 1024,
          leadingBytes: input.leadingBytes,
          limits: openLimits,
        }),
      ).toEqual({ ok: true })
    }
  })

  it('rejects mismatched extension, MIME or signature as file_type_mismatch', () => {
    const cases = [
      { fileName: 'photo.png', mimeType: 'image/jpeg', leadingBytes: jpegBytes },
      { fileName: 'photo.exe', mimeType: 'application/pdf', leadingBytes: pdfBytes },
      { fileName: 'photo.jpg', mimeType: 'image/jpeg', leadingBytes: pngBytes },
      { fileName: 'photo.png', mimeType: 'image/png', leadingBytes: pdfBytes },
      { fileName: 'photo.bin', mimeType: 'application/octet-stream', leadingBytes: pdfBytes },
    ]

    for (const input of cases) {
      expect(
        validateFileInput({
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: 1024,
          leadingBytes: input.leadingBytes,
          limits: openLimits,
        }),
      ).toEqual({ ok: false, errorCode: 'file_type_mismatch' })
    }
  })

  it('rejects the 51st file without modifying anything', () => {
    const result = validateFileInput({
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: 1024,
      leadingBytes: pngBytes,
      limits: { currentFileCount: MAX_FILES_PER_CASE, currentTotalBytes: 0, remainingQuotaBytes: null },
    })

    expect(result).toEqual({ ok: false, errorCode: 'file_count_exceeded' })
  })

  it('rejects a file larger than 50 MiB', () => {
    const result = validateFileInput({
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: MAX_SINGLE_FILE_BYTES + 1,
      leadingBytes: pngBytes,
      limits: openLimits,
    })

    expect(result).toEqual({ ok: false, errorCode: 'file_too_large' })
  })

  it('rejects a total larger than 500 MiB', () => {
    const result = validateFileInput({
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: MAX_SINGLE_FILE_BYTES,
      leadingBytes: pngBytes,
      limits: {
        currentFileCount: 1,
        currentTotalBytes: MAX_TOTAL_BYTES - MAX_SINGLE_FILE_BYTES + 1,
        remainingQuotaBytes: null,
      },
    })

    expect(result).toEqual({ ok: false, errorCode: 'total_size_exceeded' })
  })

  it('rejects files exceeding the reported remaining quota', () => {
    const result = validateFileInput({
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: 2048,
      leadingBytes: pngBytes,
      limits: { currentFileCount: 0, currentTotalBytes: 0, remainingQuotaBytes: 1024 },
    })

    expect(result).toEqual({ ok: false, errorCode: 'storage_quota_exceeded' })
  })
})
