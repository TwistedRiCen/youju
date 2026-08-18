import type { IDBPDatabase } from 'idb'
import { CaseRepositoryError } from './case-repository.js'
import { APP_PREFERENCES_KEY } from './app-preferences-repository.js'
import { isLocalAppPreferences } from './app-preferences-repository.js'
import type { AppPreferencesRepository, LocalAppPreferences } from './app-preferences-repository.js'
import type { PersistedAppPreferences, YouJuDatabaseSchema } from './database-schema.js'

function toStorageError(error: unknown): CaseRepositoryError {
  if (error instanceof CaseRepositoryError) {
    return error
  }
  return new CaseRepositoryError('storage_unavailable', '本地应用偏好不可用')
}

function toLocalAppPreferences(record: PersistedAppPreferences): LocalAppPreferences {
  const { key, ...value } = record
  if (key !== APP_PREFERENCES_KEY || !isLocalAppPreferences(value)) {
    throw new CaseRepositoryError('storage_unavailable', '本地应用偏好格式无效')
  }
  return value
}

export class IndexedDbAppPreferencesRepository implements AppPreferencesRepository {
  constructor(private readonly database: IDBPDatabase<YouJuDatabaseSchema>) {}

  async get(): Promise<LocalAppPreferences | null> {
    try {
      const record = await this.database.get('appPreferences', APP_PREFERENCES_KEY)
      return record === undefined ? null : toLocalAppPreferences(record)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async put(value: LocalAppPreferences): Promise<void> {
    try {
      if (!isLocalAppPreferences(value)) {
        throw new CaseRepositoryError('storage_unavailable', '本地应用偏好格式无效')
      }
      await this.database.put('appPreferences', {
        key: APP_PREFERENCES_KEY,
        ...value,
      })
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async clear(): Promise<void> {
    try {
      await this.database.clear('appPreferences')
    } catch (error) {
      throw toStorageError(error)
    }
  }
}
