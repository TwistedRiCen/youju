import { sha256Blob } from '@youju/evidence-hash'
import { OpfsEvidenceBlobStore, temporaryStoragePath } from '@youju/evidence-store'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import {
  buildPackageDirectoryName,
  renderSubmissionPdfs,
  validateExportSnapshot,
  writeSubmissionPackage,
} from '@youju/document-export'
import type { EvidenceExportItem, ExportPreflightResult, ExportSnapshot } from '@youju/document-export'
import type { ZipChunkSink } from '@youju/document-export'
import type { EvidenceFile, UuidV4 } from '@youju/domain'
import { selectCurrentConfirmedFacts } from '@youju/domain'
import { detectTimelineConflicts } from '@youju/timeline'
import fontUrl from '../assets/fonts/NotoSansCJKsc-Regular.otf?url'
import { detectBrowserCapabilities } from '../browser/browser-capabilities.js'
import { getCaseRepository } from './case-service.js'
import { loadFindings } from './statement-service.js'

export { buildPackageDirectoryName } from '@youju/document-export'

let blobStore: EvidenceBlobStore | null = null

function getExportBlobStore(): EvidenceBlobStore {
  if (blobStore === null) {
    blobStore = new OpfsEvidenceBlobStore()
  }
  return blobStore
}

export async function loadFontBytes(): Promise<Uint8Array> {
  const response = await fetch(fontUrl)
  if (!response.ok) {
    throw new Error('font_load_failed')
  }
  return new Uint8Array(await response.arrayBuffer())
}

export interface ExportState {
  readonly snapshot: ExportSnapshot | null
  readonly preflight: ExportPreflightResult | null
}

export async function loadExportState(caseId: UuidV4): Promise<ExportState> {
  const snapshot = await buildExportSnapshot(caseId)
  if (snapshot === null) {
    return { snapshot: null, preflight: null }
  }
  return { snapshot, preflight: validateExportSnapshot(snapshot) }
}

async function buildExportSnapshot(caseId: UuidV4): Promise<ExportSnapshot | null> {
  const repository = await getCaseRepository()
  const caseRecord = await repository.getCase(caseId)
  if (caseRecord === null) {
    return null
  }
  const currentFacts = selectCurrentConfirmedFacts(await repository.listConfirmedFacts(caseId))
  const confirmedTimeline = (await repository.listTimeline(caseId)).filter(
    (entry) => entry.status === 'confirmed',
  )
  const latestStatement = (await repository.listConfirmedStatements(caseId)).at(-1)
  if (latestStatement === undefined) {
    return null
  }
  const { findings, ruleVersion } = await loadFindings(caseId)
  const store = getExportBlobStore()
  const evidenceItems: EvidenceExportItem[] = []
  for (const item of await repository.listEvidence(caseId)) {
    try {
      const blob = await store.read(item.storageRef)
      const actualSha256 = await sha256Blob(blob)
      if (actualSha256 === item.sha256) {
        evidenceItems.push({ metadata: item, integrity: { status: 'verified', actualSha256 } })
      } else {
        evidenceItems.push({
          metadata: item,
          integrity: { status: 'hash_mismatch', actualSha256 },
        })
      }
    } catch {
      evidenceItems.push({ metadata: item, integrity: { status: 'missing' } })
    }
  }
  return {
    caseEvent: caseRecord.caseEvent,
    confirmedFacts: currentFacts,
    confirmedTimeline,
    statement: latestStatement,
    ruleVersion,
    findings,
    evidence: evidenceItems,
    conflicts: detectTimelineConflicts({ entries: confirmedTimeline, currentFacts }),
    generatedAt: new Date().toISOString(),
    appVersion: '0.1.0',
    opfsAvailable: detectBrowserCapabilities().opfs,
  }
}

export interface ExportBundle {
  readonly fileName: string
  readonly blob: Blob
  readonly cleanup: () => Promise<void>
}

export function createExportBundle(
  fileName: string,
  stagedFile: Blob,
  cleanup: () => Promise<void>,
): ExportBundle {
  return { fileName, blob: stagedFile, cleanup }
}

function createStagedSink(
  operationId: UuidV4,
  store: EvidenceBlobStore,
): { sink: ZipChunkSink; staged: Promise<unknown> } {
  const queue: Uint8Array[] = []
  const waiters: (() => void)[] = []
  let closed = false
  let aborted = false

  const notify = (): void => {
    const waiter = waiters.shift()
    waiter?.()
  }

  const generator = (async function* () {
    while (true) {
      const chunk = queue.shift()
      if (chunk !== undefined) {
        yield chunk
      } else if (closed || aborted) {
        return
      } else {
        await new Promise<void>((resolve) => {
          waiters.push(resolve)
        })
      }
    }
  })()

  const staged = store.stage(operationId, generator)

  const sink: ZipChunkSink = {
    write: async (chunk) => {
      if (closed || aborted) {
        return
      }
      queue.push(chunk)
      notify()
    },
    close: async () => {
      closed = true
      notify()
      await staged
    },
    abort: async () => {
      aborted = true
      notify()
      await staged.catch(() => undefined)
      await store.deleteTemporary(operationId).catch(() => undefined)
    },
  }

  return { sink, staged }
}

export async function prepareExportBundle(caseId: UuidV4): Promise<ExportBundle> {
  const snapshot = await buildExportSnapshot(caseId)
  if (snapshot === null) {
    throw new Error('export_snapshot_unavailable')
  }
  const preflight = validateExportSnapshot(snapshot)
  if (preflight.status === 'blocked') {
    throw new Error('export_blocked')
  }

  const repository = await getCaseRepository()
  const store = getExportBlobStore()
  const operationId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const temporaryStorageRef = temporaryStoragePath(operationId)
  const baseEntry = {
    operationId,
    caseId,
    operationType: 'package_export' as const,
    startedAt,
    errorCode: null,
  }

  await repository.putOperation({ ...baseEntry, stage: 'preparing', temporaryStorageRef })
  try {
    const fontBytes = await loadFontBytes()
    await repository.putOperation({ ...baseEntry, stage: 'writing', temporaryStorageRef })
    const pdfs = await renderSubmissionPdfs(snapshot, fontBytes)
    const { sink, staged } = createStagedSink(operationId, store)
    await writeSubmissionPackage({
      snapshot,
      pdfs,
      openEvidence: async (evidence: EvidenceFile) => store.read(evidence.storageRef),
      sink,
    })
    await staged
    await repository.putOperation({ ...baseEntry, stage: 'finalizing', temporaryStorageRef })

    const stagedFile = await store.read(temporaryStorageRef)
    const current = await repository.getCase(caseId)
    if (current !== null) {
      await repository.updateCase({
        caseId,
        expectedRevision: current.revision,
        patch: { status: 'exported' },
        updatedAt: startedAt,
        writerId: 'export',
      })
    }
    const cleanup = async (): Promise<void> => {
      await store.deleteTemporary(operationId).catch(() => undefined)
      await repository.deleteOperation(operationId).catch(() => undefined)
    }
    return createExportBundle(
      `${buildPackageDirectoryName(snapshot.generatedAt, snapshot.caseEvent.dataOrigin)}.zip`,
      stagedFile,
      cleanup,
    )
  } catch (error) {
    await store.deleteTemporary(operationId).catch(() => undefined)
    await repository.deleteOperation(operationId).catch(() => undefined)
    throw error
  }
}
