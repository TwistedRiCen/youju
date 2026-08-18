import { expect, test } from '@playwright/test'

interface LocalAppPreferences {
  readonly schemaVersion: 1
  readonly onboardingVersionSeen: number | null
  readonly lastAcknowledgedReleaseId: string | null
  readonly storagePersistence: 'unknown' | 'granted' | 'denied' | 'unsupported'
}

interface PreferencesRepository {
  get(): Promise<LocalAppPreferences | null>
  put(value: LocalAppPreferences): Promise<void>
  clear(): Promise<void>
}

test('persists one low-sensitivity preference record and clears it explicitly', async ({
  page,
}) => {
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const url = '/src/storage/index.ts'
    const storage = await import(url)
    let database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    let repository = new storage.IndexedDbAppPreferencesRepository(
      database,
    ) as PreferencesRepository
    const initial = await repository.get()

    await repository.put({
      schemaVersion: 1,
      onboardingVersionSeen: 1,
      lastAcknowledgedReleaseId: '2026.08.0',
      storagePersistence: 'granted',
    })
    database.close()

    database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    repository = new storage.IndexedDbAppPreferencesRepository(database) as PreferencesRepository
    const reopened = await repository.get()
    await repository.put({
      schemaVersion: 1,
      onboardingVersionSeen: 2,
      lastAcknowledgedReleaseId: null,
      storagePersistence: 'denied',
    })
    const overwritten = await repository.get()
    await repository.clear()
    const cleared = await repository.get()
    const keys = await database.getAllKeys('appPreferences')
    await database.put('appPreferences', {
      key: 'local-app-preferences',
      schemaVersion: 1,
      onboardingVersionSeen: 1,
      lastAcknowledgedReleaseId: null,
      storagePersistence: 'assumed',
      unexpected: true,
    } as never)
    let invalidCode: string | null = null
    try {
      await repository.get()
    } catch (error) {
      invalidCode = (error as { code?: string }).code ?? null
    }
    await database.clear('appPreferences')
    database.close()

    return { initial, reopened, overwritten, cleared, keys, invalidCode }
  })

  expect(result).toEqual({
    initial: null,
    reopened: {
      schemaVersion: 1,
      onboardingVersionSeen: 1,
      lastAcknowledgedReleaseId: '2026.08.0',
      storagePersistence: 'granted',
    },
    overwritten: {
      schemaVersion: 1,
      onboardingVersionSeen: 2,
      lastAcknowledgedReleaseId: null,
      storagePersistence: 'denied',
    },
    cleared: null,
    keys: [],
    invalidCode: 'storage_unavailable',
  })
})
