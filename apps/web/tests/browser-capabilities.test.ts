import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectBrowserCapabilities } from '../src/browser/browser-capabilities.js'

describe('browser capability detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports every capability when the APIs are available', () => {
    vi.stubGlobal('indexedDB', {})
    vi.stubGlobal('crypto', { subtle: {} })
    vi.stubGlobal('BroadcastChannel', class {})
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: () => Promise.resolve({}),
        estimate: () => Promise.resolve({}),
      },
      locks: {},
    })

    expect(detectBrowserCapabilities()).toEqual({
      indexedDb: true,
      opfs: true,
      webCrypto: true,
      webLocks: true,
      broadcastChannel: true,
      quotaEstimate: true,
    })
  })

  it('reports missing capabilities when the APIs are absent', () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('crypto', {})
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.stubGlobal('navigator', {})

    expect(detectBrowserCapabilities()).toEqual({
      indexedDb: false,
      opfs: false,
      webCrypto: false,
      webLocks: false,
      broadcastChannel: false,
      quotaEstimate: false,
    })
  })
})
