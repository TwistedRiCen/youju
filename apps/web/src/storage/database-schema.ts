import type { DBSchema } from 'idb'
import type {
  CaseEvent,
  ConfirmedFact,
  EvidenceFile,
  FactDraft,
  OperationJournalEntry,
  StatementDraft,
  ConfirmedStatement,
  TimelineEntry,
} from '@youju/domain'
import type { AiCandidate } from '@youju/ai-core'
import type { AnalysisVersion } from '@youju/domain'
import type { LocalAppPreferences } from './app-preferences-repository.js'

export const YOUJU_DATABASE_NAME = 'youju-local'
export const YOUJU_DATABASE_VERSION = 4

export type PersistedAppPreferences = LocalAppPreferences & {
  readonly key: 'local-app-preferences'
}

export type PersistedCaseEvent = CaseEvent & {
  readonly revision: number
  readonly lastWriterId: string
}

export interface YouJuDatabaseSchema extends DBSchema {
  cases: { key: string; value: PersistedCaseEvent }
  factDrafts: { key: string; value: FactDraft; indexes: { by_caseId: string } }
  confirmedFacts: { key: string; value: ConfirmedFact; indexes: { by_caseId: string } }
  timelineEntries: { key: string; value: TimelineEntry; indexes: { by_caseId: string } }
  statementDrafts: { key: string; value: StatementDraft; indexes: { by_caseId: string } }
  confirmedStatements: { key: string; value: ConfirmedStatement; indexes: { by_caseId: string } }
  evidenceMetadata: { key: string; value: EvidenceFile; indexes: { by_caseId: string } }
  operationJournal: {
    key: string
    value: OperationJournalEntry
    indexes: { by_caseId: string }
  }
  analysisVersions: { key: string; value: AnalysisVersion; indexes: { by_caseId: string } }
  aiCandidates: {
    key: string
    value: AiCandidate
    indexes: { by_caseId: string; by_analysisVersionId: string }
  }
  appPreferences: { key: string; value: PersistedAppPreferences }
}

export type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void

const CASE_STORE = 'cases'
const DRAFT_STORE = 'factDrafts'
const V2_CHILD_STORES = [
  'confirmedFacts',
  'timelineEntries',
  'statementDrafts',
  'confirmedStatements',
  'evidenceMetadata',
  'operationJournal',
] as const
function migrateLegacyProvenance(
  transaction: IDBTransaction,
  storeName: 'evidenceMetadata' | 'timelineEntries' | 'statementDrafts' | 'confirmedStatements',
): void {
  const request = transaction.objectStore(storeName).openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (cursor === null) {
      return
    }

    const record = cursor.value as Record<string, unknown>
    const updated = { ...record }
    if (storeName === 'evidenceMetadata') {
      updated.categoryOrigin ??= 'manual'
      updated.categoryCandidateId ??= null
    } else {
      updated.contentOrigin ??= 'manual'
      updated.derivedFromCandidateId ??= null
    }
    cursor.update(updated)
    cursor.continue()
  }
}

function migrateLegacyCaseIdentity(transaction: IDBTransaction): void {
  const request = transaction.objectStore(CASE_STORE).openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (cursor === null) {
      return
    }

    const record = cursor.value as Record<string, unknown>
    if (record.dataOrigin === undefined && record.demoFixtureId === undefined) {
      cursor.update({
        ...record,
        dataOrigin: 'user_created',
        demoFixtureId: null,
      })
    }
    cursor.continue()
  }
}

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  (database) => {
    database.createObjectStore(CASE_STORE, { keyPath: 'id' })
    database.createObjectStore(DRAFT_STORE, { keyPath: 'id' })
  },
  (database, transaction) => {
    for (const storeName of V2_CHILD_STORES) {
      database.createObjectStore(storeName, {
        keyPath: storeName === 'operationJournal' ? 'operationId' : 'id',
      })
    }

    const childStores: readonly string[] = [DRAFT_STORE, ...V2_CHILD_STORES]
    for (const storeName of childStores) {
      transaction.objectStore(storeName).createIndex('by_caseId', 'caseId')
    }
  },
  (database, transaction) => {
    database.createObjectStore('analysisVersions', { keyPath: 'id' }).createIndex(
      'by_caseId',
      'caseId',
    )
    database.createObjectStore('aiCandidates', { keyPath: 'id' }).createIndex('by_caseId', 'caseId')
    transaction
      .objectStore('aiCandidates')
      .createIndex('by_analysisVersionId', 'analysisVersionId')

    for (const storeName of [
      'evidenceMetadata',
      'timelineEntries',
      'statementDrafts',
      'confirmedStatements',
    ] as const) {
      migrateLegacyProvenance(transaction, storeName)
    }
  },
  (database, transaction) => {
    database.createObjectStore('appPreferences', { keyPath: 'key' })
    migrateLegacyCaseIdentity(transaction)
  },
]
