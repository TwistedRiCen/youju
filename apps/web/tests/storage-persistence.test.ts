import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  requestStoragePersistence,
  requestStoragePersistenceAfterUserAction,
  retryStoragePersistence,
} from '../src/browser/storage-persistence.js'
import type {
  AppPreferencesRepository,
  LocalAppPreferences,
} from '../src/storage/index.js'

class MemoryPreferences implements AppPreferencesRepository {
  constructor(public value: LocalAppPreferences | null) {}

  async get(): Promise<LocalAppPreferences | null> {
    return this.value
  }

  async put(value: LocalAppPreferences): Promise<void> {
    this.value = value
  }

  async clear(): Promise<void> {
    this.value = null
  }
}

const initialPreferences: LocalAppPreferences = {
  schemaVersion: 1,
  onboardingVersionSeen: 1,
  lastAcknowledgedReleaseId: '2026.08.0',
  storagePersistence: 'unknown',
}

describe('storage persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    { value: true, expected: 'granted' },
    { value: false, expected: 'denied' },
  ] as const)('maps persist=$value to $expected', async ({ value, expected }) => {
    const persist = vi.fn().mockResolvedValue(value)
    await expect(requestStoragePersistence({ persist })).resolves.toBe(expected)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('returns unsupported without invoking another storage API', async () => {
    await expect(requestStoragePersistence({})).resolves.toBe('unsupported')
  })

  it('returns granted without prompting when storage is already persisted', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    const persisted = vi.fn().mockResolvedValue(true)
    await expect(requestStoragePersistence({ persist, persisted })).resolves.toBe('granted')
    expect(persisted).toHaveBeenCalledTimes(1)
    expect(persist).not.toHaveBeenCalled()
  })

  it('maps a rejected persistence request to denied', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('blocked'))
    await expect(requestStoragePersistence({ persist })).resolves.toBe('denied')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('requests once only while the stored state is unknown and preserves other preferences', async () => {
    const preferences = new MemoryPreferences(initialPreferences)
    const persist = vi.fn().mockResolvedValue(false)

    await expect(
      requestStoragePersistenceAfterUserAction(preferences, { persist }),
    ).resolves.toBe('denied')
    await expect(
      requestStoragePersistenceAfterUserAction(preferences, { persist }),
    ).resolves.toBe('denied')

    expect(persist).toHaveBeenCalledTimes(1)
    expect(preferences.value).toEqual({
      ...initialPreferences,
      storagePersistence: 'denied',
    })
  })

  it('only retries a denied result after an explicit retry', async () => {
    const preferences = new MemoryPreferences({
      ...initialPreferences,
      storagePersistence: 'denied',
    })
    const persist = vi.fn().mockResolvedValue(true)

    await expect(retryStoragePersistence(preferences, { persist })).resolves.toBe('granted')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(preferences.value?.storagePersistence).toBe('granted')
  })
})
