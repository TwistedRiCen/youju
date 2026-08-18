import {
  DATABASE_MIGRATIONS,
  IndexedDbAppPreferencesRepository,
  openYoujuDatabase,
} from '../storage/index.js'
import type {
  AppPreferencesRepository,
  LocalAppPreferences,
  StoragePersistenceStatus,
} from '../storage/index.js'

export const ONBOARDING_VERSION = 1

export interface StoragePersistenceApi {
  readonly persist?: () => Promise<boolean>
  readonly persisted?: () => Promise<boolean>
}

type PersistenceResult = Exclude<StoragePersistenceStatus, 'unknown'>
type PersistenceListener = (status: StoragePersistenceStatus) => void

const listeners = new Set<PersistenceListener>()
let preferencesRepositoryPromise: Promise<AppPreferencesRepository> | null = null

function defaultPreferences(): LocalAppPreferences {
  return {
    schemaVersion: 1,
    onboardingVersionSeen: null,
    lastAcknowledgedReleaseId: null,
    storagePersistence: 'unknown',
  }
}

function browserStorage(): StoragePersistenceApi {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    return {}
  }
  return navigator.storage
}

function notify(status: StoragePersistenceStatus): void {
  for (const listener of listeners) {
    listener(status)
  }
}

export function subscribeStoragePersistence(listener: PersistenceListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAppPreferencesRepository(): Promise<AppPreferencesRepository> {
  if (preferencesRepositoryPromise === null) {
    preferencesRepositoryPromise = openYoujuDatabase(DATABASE_MIGRATIONS).then(
      (database) => new IndexedDbAppPreferencesRepository(database),
    )
  }
  return preferencesRepositoryPromise
}

export async function requestStoragePersistence(
  storage: StoragePersistenceApi = browserStorage(),
): Promise<PersistenceResult> {
  if (typeof storage.persist !== 'function') {
    return 'unsupported'
  }
  try {
    if (typeof storage.persisted === 'function' && await storage.persisted()) {
      return 'granted'
    }
    return await storage.persist() ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

async function savePersistenceResult(
  repository: AppPreferencesRepository,
  status: PersistenceResult,
): Promise<PersistenceResult> {
  const current = (await repository.get()) ?? defaultPreferences()
  await repository.put({ ...current, storagePersistence: status })
  notify(status)
  return status
}

export async function requestStoragePersistenceAfterUserAction(
  repository?: AppPreferencesRepository,
  storage: StoragePersistenceApi = browserStorage(),
): Promise<StoragePersistenceStatus> {
  const preferences = repository ?? await getAppPreferencesRepository()
  const current = (await preferences.get()) ?? defaultPreferences()
  if (current.storagePersistence !== 'unknown') {
    return current.storagePersistence
  }
  return savePersistenceResult(preferences, await requestStoragePersistence(storage))
}

export async function retryStoragePersistence(
  repository?: AppPreferencesRepository,
  storage: StoragePersistenceApi = browserStorage(),
): Promise<PersistenceResult> {
  const preferences = repository ?? await getAppPreferencesRepository()
  return savePersistenceResult(preferences, await requestStoragePersistence(storage))
}

export async function recordOnboardingVersionSeen(
  repository: AppPreferencesRepository,
): Promise<void> {
  const current = (await repository.get()) ?? defaultPreferences()
  await repository.put({ ...current, onboardingVersionSeen: ONBOARDING_VERSION })
}

export async function shouldShowFirstUseGuide(
  repository: AppPreferencesRepository,
): Promise<boolean> {
  return (await repository.get())?.onboardingVersionSeen !== ONBOARDING_VERSION
}
