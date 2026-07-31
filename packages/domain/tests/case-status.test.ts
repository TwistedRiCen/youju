import { deriveCaseStatus } from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('deriveCaseStatus', () => {
  it('stays draft until formal content exists', () => {
    expect(
      deriveCaseStatus({
        hasFormalContent: false,
        currentPreflightReady: false,
        currentSnapshotExported: false,
      }),
    ).toBe('draft')
  })

  it('returns in_progress once formal content exists but preflight is not ready', () => {
    expect(
      deriveCaseStatus({
        hasFormalContent: true,
        currentPreflightReady: false,
        currentSnapshotExported: false,
      }),
    ).toBe('in_progress')
  })

  it('returns ready_to_export when the current snapshot passes preflight and is not exported', () => {
    expect(
      deriveCaseStatus({
        hasFormalContent: true,
        currentPreflightReady: true,
        currentSnapshotExported: false,
      }),
    ).toBe('ready_to_export')
  })

  it('returns exported only while the exported snapshot matches current content', () => {
    expect(
      deriveCaseStatus({
        hasFormalContent: true,
        currentPreflightReady: true,
        currentSnapshotExported: true,
      }),
    ).toBe('exported')
  })

  it('falls back to in_progress when referenced content changes after export', () => {
    expect(
      deriveCaseStatus({
        hasFormalContent: true,
        currentPreflightReady: false,
        currentSnapshotExported: true,
      }),
    ).toBe('in_progress')
  })
})
