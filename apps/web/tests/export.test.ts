import { describe, expect, it } from 'vitest'
import {
  buildPackageDirectoryName,
  createExportBundle,
} from '../src/services/export-service.js'

describe('export helpers', () => {
  it('builds the fixed package directory name from a UTC timestamp', () => {
    expect(buildPackageDirectoryName('2026-07-31T12:00:00.000Z')).toBe(
      '有据_事件材料包_20260731_1200',
    )
  })

  it('prefixes only demo package names', () => {
    expect(buildPackageDirectoryName('2026-07-31T12:00:00.000Z', 'fictional_demo')).toBe(
      'DEMO-有据_事件材料包_20260731_1200',
    )
    expect(buildPackageDirectoryName('2026-07-31T12:00:00.000Z', 'user_created')).toBe(
      '有据_事件材料包_20260731_1200',
    )
  })

  it('reuses the staged ZIP blob without materializing a second full copy', () => {
    const stagedFile = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' })

    const bundle = createExportBundle(
      '有据_事件材料包_20260731_1200.zip',
      stagedFile,
      async () => undefined,
    )

    expect(bundle.fileName).toBe('有据_事件材料包_20260731_1200.zip')
    expect(bundle.blob).toBe(stagedFile)
  })

  it('exposes deferred cleanup for the staged ZIP file', async () => {
    let cleaned = false
    const bundle = createExportBundle(
      '有据_事件材料包_20260731_1200.zip',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' }),
      async () => {
        cleaned = true
      },
    )

    await bundle.cleanup()

    expect(cleaned).toBe(true)
  })
})
