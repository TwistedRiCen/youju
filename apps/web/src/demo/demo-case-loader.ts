import { sha256Blob } from '@youju/evidence-hash'
import { EvidenceBlobStoreError, evidenceStoragePath } from '@youju/evidence-store'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type {
  CaseEvent,
  ConfirmedStatement,
  EvidenceFile,
  FactDraft,
  M2ErrorCode,
  OperationJournalEntry,
  TimelineEntry,
  UuidV4,
} from '@youju/domain'
import type { CaseRepository } from '../storage/index.js'
import type {
  PublicDemoAssetReader,
  PublicDemoFixtureManifest,
} from './demo-fixture.js'
import { verifyPublicDemoAssets } from './demo-fixture.js'

export type DemoCaseLoadErrorCode =
  | 'invalid_fixture'
  | 'demo_case_ambiguous'
  | 'delete_verification_failed'
  | 'storage_quota_exceeded'
  | 'storage_not_supported'
  | 'storage_unavailable'
  | 'demo_verification_failed'

export class DemoCaseLoadError extends Error {
  constructor(readonly code: DemoCaseLoadErrorCode) {
    super(code)
    this.name = 'DemoCaseLoadError'
  }
}

export interface DemoCaseLoaderDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
  readonly readAsset: PublicDemoAssetReader
  readonly estimateStorage?: () => Promise<{ readonly quota?: number; readonly usage?: number }>
  readonly now?: () => string
  readonly uuid?: () => UuidV4
}

export interface PersistedDemoCaseResult {
  readonly caseId: UuidV4
  readonly operationId: UuidV4
}

type DemoLoadJournal = Extract<OperationJournalEntry, { operationType: 'demo_case_load' }>

interface DemoRuntimeIds {
  readonly evidence: ReadonlyMap<string, UuidV4>
  readonly drafts: ReadonlyMap<string, UuidV4>
  readonly facts: ReadonlyMap<string, UuidV4>
  readonly timeline: ReadonlyMap<string, UuidV4>
  readonly statement: UuidV4
}

const oneChunk = async function* (bytes: Uint8Array) {
  yield bytes
}

const journalErrorCode = (error: unknown): M2ErrorCode | null => {
  if (error instanceof DemoCaseLoadError) {
    if (error.code === 'storage_quota_exceeded') return 'storage_quota_exceeded'
    if (error.code === 'storage_not_supported') return 'storage_not_supported'
  }
  if (error instanceof EvidenceBlobStoreError) {
    if (error.code === 'quota_exceeded') return 'storage_quota_exceeded'
    if (error.code === 'not_allowed') return 'storage_not_supported'
  }
  return null
}

const ensureQuota = async (
  manifest: PublicDemoFixtureManifest,
  estimateStorage?: DemoCaseLoaderDependencies['estimateStorage'],
) => {
  if (estimateStorage === undefined) return
  let estimate: Awaited<ReturnType<NonNullable<typeof estimateStorage>>>
  try {
    estimate = await estimateStorage()
  } catch {
    throw new DemoCaseLoadError('storage_unavailable')
  }
  if (estimate.quota === undefined || estimate.usage === undefined) return
  const totalBytes = manifest.evidence.reduce((total, item) => total + item.size, 0)
  const largestTemporary = Math.max(...manifest.evidence.map(({ size }) => size))
  if (estimate.quota - estimate.usage < totalBytes + largestTemporary) {
    throw new DemoCaseLoadError('storage_quota_exceeded')
  }
}

const verifyPersistedDemo = async (
  manifest: PublicDemoFixtureManifest,
  caseId: UuidV4,
  ids: DemoRuntimeIds,
  dependencies: Pick<DemoCaseLoaderDependencies, 'repository' | 'blobStore'>,
) => {
  const aggregate = await dependencies.repository.getCase(caseId)
  const evidence = await dependencies.repository.listEvidence(caseId)
  const facts = await dependencies.repository.listConfirmedFacts(caseId)
  const timeline = await dependencies.repository.listTimeline(caseId)
  const statements = await dependencies.repository.listConfirmedStatements(caseId)
  const blobRefs = await dependencies.blobStore.listCaseStorageRefs(caseId)
  if (
    aggregate === null ||
    aggregate.caseEvent.id !== caseId ||
    aggregate.caseEvent.scenarioType !== manifest.case.scenarioType ||
    aggregate.caseEvent.title !== manifest.case.title ||
    aggregate.caseEvent.createdAt !== manifest.case.createdAt ||
    aggregate.caseEvent.updatedAt !== manifest.case.updatedAt ||
    aggregate.caseEvent.status !== manifest.case.status ||
    aggregate.caseEvent.requestedResolution !== manifest.case.requestedResolution ||
    aggregate.caseEvent.storageMode !== manifest.case.storageMode ||
    aggregate.caseEvent.schemaVersion !== manifest.case.schemaVersion ||
    aggregate.caseEvent.dataOrigin !== 'fictional_demo' ||
    aggregate.caseEvent.demoFixtureId !== manifest.fixtureId ||
    aggregate.factDrafts.length !== manifest.facts.length ||
    evidence.length !== manifest.evidence.length ||
    facts.length !== manifest.facts.length ||
    timeline.length !== manifest.timeline.length ||
    statements.length !== 1 ||
    blobRefs.join('\n') !== evidence.map(({ storageRef }) => storageRef).sort().join('\n') ||
    (await dependencies.repository.listAnalyses(caseId)).length !== 0 ||
    (await dependencies.repository.listCandidates(caseId)).length !== 0
  ) {
    throw new DemoCaseLoadError('demo_verification_failed')
  }

  const expectedRefs = (tokens: readonly string[]) =>
    tokens.map((token) => ({ evidenceId: ids.evidence.get(token)! }))
  const sameRefs = (
    actual: readonly { readonly evidenceId: string }[],
    expected: readonly { readonly evidenceId: string }[],
  ) =>
    actual.length === expected.length &&
    actual.every((reference, index) => reference.evidenceId === expected[index]?.evidenceId)

  for (const item of manifest.evidence) {
    const id = ids.evidence.get(item.token)!
    const actual = evidence.find((record) => record.id === id)
    if (
      actual === undefined ||
      actual.caseId !== caseId ||
      actual.originalName !== item.originalName ||
      actual.mediaType !== item.mediaType ||
      actual.size !== item.size ||
      actual.sha256 !== item.sha256 ||
      actual.importedAt !== item.importedAt ||
      actual.sourceCreatedAt !== item.sourceCreatedAt ||
      actual.category !== item.category ||
      actual.categoryOrigin !== 'manual' ||
      actual.categoryCandidateId !== null ||
      actual.storageRef !== evidenceStoragePath(caseId, id) ||
      actual.isOriginalPreserved !== true ||
      Object.keys(actual.metadata).length !== 2 ||
      actual.metadata.fictional !== true ||
      actual.metadata.description !== item.description
    ) {
      throw new DemoCaseLoadError('demo_verification_failed')
    }
  }

  for (const item of manifest.facts) {
    const expectedSourceRefs = expectedRefs(item.sourceTokens)
    const draft = aggregate.factDrafts.find((record) => record.id === ids.drafts.get(item.token))
    const fact = facts.find((record) => record.id === ids.facts.get(item.token))
    if (
      draft === undefined ||
      draft.caseId !== caseId ||
      draft.factType !== item.factType ||
      draft.fieldName !== item.fieldName ||
      draft.value !== item.value ||
      draft.updatedAt !== item.confirmedAt ||
      draft.revision !== 1 ||
      !sameRefs(draft.sourceRefs, expectedSourceRefs) ||
      fact === undefined ||
      fact.caseId !== caseId ||
      fact.factType !== item.factType ||
      fact.fieldName !== item.fieldName ||
      fact.value !== item.value ||
      fact.confirmedAt !== item.confirmedAt ||
      fact.confirmationMethod !== 'manual' ||
      fact.derivedFromCandidateId !== null ||
      fact.replacesFactId !== null ||
      fact.version !== item.version ||
      !sameRefs(fact.sourceRefs, expectedSourceRefs)
    ) {
      throw new DemoCaseLoadError('demo_verification_failed')
    }
  }

  for (const item of manifest.timeline) {
    const actual = timeline.find((record) => record.id === ids.timeline.get(item.token))
    if (
      actual === undefined ||
      actual.caseId !== caseId ||
      actual.occurredAt !== item.occurredAt ||
      actual.timePrecision !== item.timePrecision ||
      actual.summary !== item.summary ||
      actual.detail !== item.detail ||
      !sameRefs(actual.sourceRefs, expectedRefs(item.sourceTokens)) ||
      actual.contentOrigin !== 'manual' ||
      actual.derivedFromCandidateId !== null ||
      actual.status !== item.status ||
      actual.sortOrder !== item.sortOrder
    ) {
      throw new DemoCaseLoadError('demo_verification_failed')
    }
  }

  const statement = statements[0]!
  if (
    statement.id !== ids.statement ||
    statement.caseId !== caseId ||
    statement.content !== manifest.statement.content ||
    statement.confirmedFactIds.join('\n') !==
      manifest.statement.factTokens.map((token) => ids.facts.get(token)!).join('\n') ||
    statement.confirmedTimelineEntryIds.join('\n') !==
      manifest.statement.timelineTokens.map((token) => ids.timeline.get(token)!).join('\n') ||
    statement.contentOrigin !== 'manual' ||
    statement.derivedFromCandidateId !== null ||
    statement.ruleVersion !== '1.0.0' ||
    statement.confirmedAt !== manifest.statement.confirmedAt ||
    statement.version !== 1
  ) {
    throw new DemoCaseLoadError('demo_verification_failed')
  }

  for (const item of evidence) {
    const blob = await dependencies.blobStore.read(item.storageRef)
    if (blob.size !== item.size || (await sha256Blob(blob)) !== item.sha256) {
      throw new DemoCaseLoadError('demo_verification_failed')
    }
  }
}

export async function persistDemoCase(
  manifest: PublicDemoFixtureManifest,
  dependencies: DemoCaseLoaderDependencies,
): Promise<PersistedDemoCaseResult> {
  const assetBytes = new Map<string, Uint8Array>()
  try {
    await verifyPublicDemoAssets(manifest, async (relativePath) => {
      const bytes = await dependencies.readAsset(relativePath)
      assetBytes.set(relativePath, bytes)
      return bytes
    })
  } catch {
    throw new DemoCaseLoadError('demo_verification_failed')
  }
  await ensureQuota(manifest, dependencies.estimateStorage)

  const uuid = dependencies.uuid ?? (() => crypto.randomUUID())
  const startedAt = (dependencies.now ?? (() => new Date().toISOString()))()
  const operationId = uuid()
  const caseId = uuid()
  const evidenceIds = new Map(manifest.evidence.map((item) => [item.token, uuid()]))
  const draftIds = new Map(manifest.facts.map((item) => [item.token, uuid()]))
  const factIds = new Map(manifest.facts.map((item) => [item.token, uuid()]))
  const timelineIds = new Map(manifest.timeline.map((item) => [item.token, uuid()]))
  const statementId = uuid()
  const generatedIds = [
    operationId,
    caseId,
    ...evidenceIds.values(),
    ...draftIds.values(),
    ...factIds.values(),
    ...timelineIds.values(),
    statementId,
  ]
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  if (
    generatedIds.some((id) => !uuidPattern.test(id)) ||
    new Set(generatedIds).size !== generatedIds.length
  ) {
    throw new DemoCaseLoadError('storage_unavailable')
  }
  const baseJournal = {
    operationId,
    caseId,
    operationType: 'demo_case_load' as const,
    demoFixtureId: manifest.fixtureId,
    startedAt,
    errorCode: null,
  }
  let journalCreated = false

  try {
    await dependencies.repository.putOperation({ ...baseJournal, stage: 'validating' })
    journalCreated = true
    await dependencies.repository.putOperation({ ...baseJournal, stage: 'writing' })

    const storageRefs = new Map<string, string>()
    for (const item of manifest.evidence) {
      const bytes = assetBytes.get(item.assetPath)
      const evidenceId = evidenceIds.get(item.token)
      if (bytes === undefined || evidenceId === undefined) {
        throw new DemoCaseLoadError('storage_unavailable')
      }
      const staged = await dependencies.blobStore.stage(operationId, oneChunk(bytes))
      storageRefs.set(
        item.token,
        await dependencies.blobStore.commit(staged, caseId, evidenceId),
      )
    }

    const caseEvent: CaseEvent = {
      id: caseId,
      scenarioType: manifest.case.scenarioType,
      title: manifest.case.title,
      createdAt: manifest.case.createdAt,
      updatedAt: manifest.case.updatedAt,
      status: manifest.case.status,
      requestedResolution: manifest.case.requestedResolution,
      storageMode: 'local',
      schemaVersion: 2,
      dataOrigin: 'fictional_demo',
      demoFixtureId: manifest.fixtureId,
    }
    const drafts: FactDraft[] = manifest.facts.map((item) => ({
      id: draftIds.get(item.token)!,
      caseId,
      factType: item.factType,
      fieldName: item.fieldName,
      value: item.value,
      sourceRefs: item.sourceTokens.map((token) => ({ evidenceId: evidenceIds.get(token)! })),
      updatedAt: item.confirmedAt,
      revision: 1,
    })) as FactDraft[]
    await dependencies.repository.createCase(caseEvent, drafts, 'public-demo-loader')

    for (const item of manifest.evidence) {
      const evidence: EvidenceFile = {
        id: evidenceIds.get(item.token)!,
        caseId,
        originalName: item.originalName,
        mediaType: item.mediaType,
        size: item.size,
        sha256: item.sha256,
        importedAt: item.importedAt,
        sourceCreatedAt: item.sourceCreatedAt,
        category: item.category,
        categoryOrigin: 'manual',
        categoryCandidateId: null,
        storageRef: storageRefs.get(item.token)!,
        isOriginalPreserved: true,
        metadata: { fictional: true, description: item.description },
      }
      await dependencies.repository.addReadyEvidence(evidence, operationId)
    }

    for (const item of manifest.facts) {
      await dependencies.repository.confirmFact({
        draftId: draftIds.get(item.token)!,
        confirmedFactId: factIds.get(item.token)!,
        confirmedAt: item.confirmedAt,
        sourceRefs: item.sourceTokens.map((token) => ({ evidenceId: evidenceIds.get(token)! })),
        replacesFactId: null,
      })
    }

    for (const item of manifest.timeline) {
      const entry: TimelineEntry = {
        id: timelineIds.get(item.token)!,
        caseId,
        occurredAt: item.occurredAt,
        timePrecision: item.timePrecision,
        summary: item.summary,
        detail: item.detail,
        sourceRefs: item.sourceTokens.map((token) => ({ evidenceId: evidenceIds.get(token)! })),
        contentOrigin: 'manual',
        derivedFromCandidateId: null,
        status: 'confirmed',
        sortOrder: item.sortOrder,
      }
      await dependencies.repository.putTimelineDraft(entry)
      await dependencies.repository.confirmTimelineEntry(entry.id)
    }

    const statement: ConfirmedStatement = {
      id: statementId,
      caseId,
      content: manifest.statement.content,
      confirmedFactIds: manifest.statement.factTokens.map((token) => factIds.get(token)!),
      confirmedTimelineEntryIds: manifest.statement.timelineTokens.map(
        (token) => timelineIds.get(token)!,
      ),
      contentOrigin: 'manual',
      derivedFromCandidateId: null,
      ruleVersion: '1.0.0',
      confirmedAt: manifest.statement.confirmedAt,
      version: 1,
    }
    await dependencies.repository.appendConfirmedStatement(statement)
    const current = await dependencies.repository.getCase(caseId)
    if (current === null) throw new DemoCaseLoadError('demo_verification_failed')
    await dependencies.repository.updateCase({
      caseId,
      expectedRevision: current.revision,
      patch: {
        title: manifest.case.title,
        requestedResolution: manifest.case.requestedResolution,
        status: manifest.case.status,
      },
      updatedAt: manifest.case.updatedAt,
      writerId: 'public-demo-loader',
    })
    await dependencies.repository.putOperation({ ...baseJournal, stage: 'verifying' })
    await verifyPersistedDemo(
      manifest,
      caseId,
      {
        evidence: evidenceIds,
        drafts: draftIds,
        facts: factIds,
        timeline: timelineIds,
        statement: statementId,
      },
      dependencies,
    )
    await dependencies.repository.deleteOperation(operationId)
    return { caseId, operationId }
  } catch (error) {
    if (journalCreated) {
      await dependencies.repository
        .putOperation({
          ...baseJournal,
          stage: 'failed',
          errorCode: journalErrorCode(error),
        } satisfies DemoLoadJournal)
        .catch(() => undefined)
    }
    if (error instanceof DemoCaseLoadError) throw error
    if (error instanceof EvidenceBlobStoreError && error.code === 'quota_exceeded') {
      throw new DemoCaseLoadError('storage_quota_exceeded')
    }
    if (error instanceof EvidenceBlobStoreError && error.code === 'not_allowed') {
      throw new DemoCaseLoadError('storage_not_supported')
    }
    throw new DemoCaseLoadError('storage_unavailable')
  }
}
