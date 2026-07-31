import { describe, expect, it } from 'vitest'
import { buildPackageDirectoryName } from '../src/services/export-service.js'

describe('export helpers', () => {
  it('builds the fixed package directory name from a UTC timestamp', () => {
    expect(buildPackageDirectoryName('2026-07-31T12:00:00.000Z')).toBe(
      '有据_事件材料包_20260731_1200',
    )
  })
})
