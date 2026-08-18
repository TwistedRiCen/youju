export const APP_PREFERENCES_KEY = 'local-app-preferences'

export type StoragePersistenceStatus = 'unknown' | 'granted' | 'denied' | 'unsupported'

export interface LocalAppPreferences {
  readonly schemaVersion: 1
  readonly onboardingVersionSeen: number | null
  readonly lastAcknowledgedReleaseId: string | null
  readonly storagePersistence: StoragePersistenceStatus
}

const STORAGE_PERSISTENCE_VALUES: readonly StoragePersistenceStatus[] = [
  'unknown',
  'granted',
  'denied',
  'unsupported',
]
const PREFERENCE_KEYS = [
  'lastAcknowledgedReleaseId',
  'onboardingVersionSeen',
  'schemaVersion',
  'storagePersistence',
]

export function isLocalAppPreferences(value: unknown): value is LocalAppPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return (
    keys.length === PREFERENCE_KEYS.length &&
    keys.every((key, index) => key === PREFERENCE_KEYS[index]) &&
    record.schemaVersion === 1 &&
    (record.onboardingVersionSeen === null ||
      (Number.isInteger(record.onboardingVersionSeen) &&
        (record.onboardingVersionSeen as number) >= 0)) &&
    (record.lastAcknowledgedReleaseId === null ||
      (typeof record.lastAcknowledgedReleaseId === 'string' &&
        record.lastAcknowledgedReleaseId.length > 0)) &&
    typeof record.storagePersistence === 'string' &&
    STORAGE_PERSISTENCE_VALUES.includes(record.storagePersistence as StoragePersistenceStatus)
  )
}

export interface AppPreferencesRepository {
  get(): Promise<LocalAppPreferences | null>
  put(value: LocalAppPreferences): Promise<void>
  clear(): Promise<void>
}
