import { wrap } from 'idb'
import type { IDBPDatabase } from 'idb'
import { CaseRepositoryError } from './case-repository.js'
import { YOUJU_DATABASE_NAME } from './database-schema.js'
import type { DatabaseMigration, YouJuDatabaseSchema } from './database-schema.js'

export function openYoujuDatabase(
  migrations: readonly DatabaseMigration[],
): Promise<IDBPDatabase<YouJuDatabaseSchema>> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(YOUJU_DATABASE_NAME, migrations.length)
    } catch {
      reject(
        new CaseRepositoryError(
          'storage_not_supported',
          '本地数据库版本不受支持，未删除任何数据',
        ),
      )
      return
    }

    request.onupgradeneeded = (event) => {
      const database = request.result
      const transaction = request.transaction
      if (transaction === null) {
        return
      }

      try {
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion
        for (let version = oldVersion + 1; version <= migrations.length; version += 1) {
          migrations[version - 1]?.(database, transaction)
        }
      } catch {
        reject(new CaseRepositoryError('storage_unavailable', '本地数据库升级失败'))
        transaction.abort()
      }
    }

    request.onblocked = () => {
      reject(new CaseRepositoryError('storage_unavailable', '本地数据库升级被其他页面阻塞'))
    }

    request.onerror = () => {
      const errorName = request.error?.name
      if (errorName === 'VersionError' || errorName === 'InvalidStateError') {
        reject(
          new CaseRepositoryError(
            'storage_not_supported',
            '本地数据库版本不受支持，未删除任何数据',
          ),
        )
        return
      }
      reject(new CaseRepositoryError('storage_unavailable', '本地数据库不可用'))
    }

    request.onsuccess = () => {
      const database = wrap(request.result) as unknown as IDBPDatabase<YouJuDatabaseSchema>
      resolve(database)
    }
  })
}
