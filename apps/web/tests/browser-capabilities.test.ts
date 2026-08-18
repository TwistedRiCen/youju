import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectBrowserCapabilities } from '../src/browser/browser-capabilities.js'

describe('browser capability detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports every capability when the APIs are available', () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('indexedDB', {})
    vi.stubGlobal('crypto', { subtle: {} })
    vi.stubGlobal('BroadcastChannel', class {})
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: () => Promise.resolve({}),
        estimate: () => Promise.resolve({}),
        persist,
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
      storagePersistence: true,
    })
    expect(persist).not.toHaveBeenCalled()
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
      storagePersistence: false,
    })
  })
})
