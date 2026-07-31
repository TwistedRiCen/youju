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

export const YOUJU_DATABASE_NAME = 'youju-local'
export const YOUJU_DATABASE_VERSION = 2

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
]
