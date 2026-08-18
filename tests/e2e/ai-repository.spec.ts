import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void

interface BrowserDatabase {
  readonly version: number
  readonly objectStoreNames: DOMStringList
  close(): void
  put(storeName: string, value: unknown): Promise<unknown>
  get(storeName: string, key: string): Promise<unknown>
}

interface BrowserAnalysis {
  readonly id: string
  readonly status: string
  readonly errorCode: string | null
}

interface BrowserAiRepository {
  getCandidate(id: string): Promise<unknown | null>
  createAnalysis(version: unknown): Promise<void>
  updateAnalysis(version: unknown): Promise<void>
  publishCompletedAnalysis(version: unknown, candidates: readonly unknown[]): Promise<void>
  getAnalysis(id: string): Promise<BrowserAnalysis | null>
  listAnalyses(caseId: string): Promise<readonly BrowserAnalysis[]>
  listCandidates(caseId: string): Promise<readonly unknown[]>
  putCandidate(candidate: unknown): Promise<void>
  confirmCandidate(command: unknown, ruleVersion: string): Promise<void>
  confirmCandidates(commands: readonly unknown[], ruleVersion: string): Promise<void>
  cancelInterruptedAnalyses(cancelledAt: string): Promise<number>
  deleteAnalysis(id: string): Promise<void>
  deleteAllAiRecords(caseId: string): Promise<void>
}

interface BrowserCaseRepository {
  deleteAllCaseRecords(caseId: string): Promise<void>
  updateEvidenceCategory(caseId: string, evidenceId: string, category: string): Promise<unknown>
  putStatementDraft(draft: unknown): Promise<void>
}

interface BrowserStorageModule {
  readonly DATABASE_MIGRATIONS: readonly DatabaseMigration[]
  openYoujuDatabase(migrations: readonly DatabaseMigration[]): Promise<BrowserDatabase>
  IndexedDbAiRepository: new (
    database: BrowserDatabase,
    failureInjector?: (candidate: unknown, index: number) => void,
    confirmationFailureInjector?: (step: 'candidate' | 'formal') => void,
  ) => BrowserAiRepository
  IndexedDbCaseRepository: new (database: BrowserDatabase) => BrowserCaseRepository
}

interface BrowserWindow {
  __youjuStorage?: BrowserStorageModule
  __youjuDatabase?: BrowserDatabase
  __youjuAiRepo?: BrowserAiRepository
  __youjuCaseRepo?: BrowserCaseRepository
}

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const analysisId = '00000000-0000-4000-8000-000000000201'
const secondAnalysisId = '00000000-0000-4000-8000-000000000202'
const candidateId = '00000000-0000-4000-8000-000000000301'
const secondCandidateId = '00000000-0000-4000-8000-000000000302'

const analysis = {
  id: analysisId,
  caseId,
  taskType: 'extract_facts' as const,
  providerPreset: 'openai' as const,
  protocol: 'responses' as const,
  baseUrlFingerprint: 'sha256:provider.example',
  modelName: 'example-model',
  promptVersion: 'm3-prompt-v1',
  outputSchemaVersion: 1,
  inputManifestDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  inputItemCount: 1,
  inputPageCount: 1,
  inputDerivedBytes: 1024,
  batchCount: 1,
  completedBatchCount: 0,
  securityPolicyVersion: 'm3-security-v1',
  repairAttempted: false,
  providerRequestIdFingerprint: null,
  usage: null,
  startedAt: '2026-08-12T01:00:00.000Z',
  completedAt: null,
  status: 'running' as const,
  errorCode: null,
}

const completedAnalysis = {
  ...analysis,
  completedBatchCount: 1,
  completedAt: '2026-08-12T01:01:00.000Z',
  status: 'completed' as const,
}

const candidate = {
  id: candidateId,
  caseId,
  analysisVersionId: analysisId,
  candidateType: 'fact' as const,
  origin: 'ai' as const,
  reviewStatus: 'pending' as const,
  createdAt: '2026-08-12T01:00:30.000Z',
  confidenceLevel: 'high' as const,
  sourceRefs: [{ evidenceId }],
  sourceLocations: [{ evidenceId, page: 1, pixelWidth: 1200, pixelHeight: 1600 }],
  factType: 'payment' as const,
  fieldName: 'paid_amount' as const,
  value: '899.00',
  normalizedValue: '89900',
}

const secondCandidate = { ...candidate, id: secondCandidateId }

async function resetDatabase(page: Page): Promise<void> {
  // Reset from a static page so the app never holds an open connection
  // that would block the database deletion.
  await page.goto('/demo/m4-ecommerce-refund-demo-v1/manifest.json')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('youju-local')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('database_delete_blocked'))
      }),
  )
}

async function openRepositories(page: Page): Promise<void> {
  await resetDatabase(page)
  await page.evaluate(async () => {
    const storage = (await import('/src/storage/index.ts')) as unknown as BrowserStorageModule
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const host = window as unknown as BrowserWindow
    host.__youjuStorage = storage
    host.__youjuDatabase = database
    host.__youjuAiRepo = new storage.IndexedDbAiRepository(database)
    host.__youjuCaseRepo = new storage.IndexedDbCaseRepository(database)
  })
}

test('migrates M2 records and creates indexed AI stores', async ({ page }) => {
  await resetDatabase(page)

  const result = await page.evaluate(async (payload) => {
    const storage = (await import('/src/storage/index.ts')) as unknown as BrowserStorageModule
    const legacy = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS.slice(0, 2))
    await legacy.put('evidenceMetadata', {
      id: payload.evidenceId,
      caseId: payload.caseId,
      originalName: 'legacy.txt',
      mediaType: 'text/plain',
      size: 1,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      importedAt: '2026-08-12T01:00:00.000Z',
      sourceCreatedAt: null,
      category: 'other',
      storageRef: 'evidence/legacy',
      isOriginalPreserved: true,
      metadata: {},
    })
    await legacy.put('timelineEntries', {
      id: '00000000-0000-4000-8000-000000000401',
      caseId: payload.caseId,
      occurredAt: '2026-08-12T01:00:00.000Z',
      timePrecision: 'minute',
      summary: 'legacy timeline',
      detail: null,
      sourceRefs: [],
      status: 'draft',
      sortOrder: 0,
    })
    await legacy.put('statementDrafts', {
      id: '00000000-0000-4000-8000-000000000402',
      caseId: payload.caseId,
      text: 'legacy statement',
      confirmedFactIds: [],
      confirmedTimelineEntryIds: [],
      updatedAt: '2026-08-12T01:00:00.000Z',
      revision: 1,
    })
    await legacy.put('confirmedStatements', {
      id: '00000000-0000-4000-8000-000000000403',
      caseId: payload.caseId,
      text: 'legacy statement',
      confirmedFactIds: [],
      confirmedTimelineEntryIds: [],
      ruleVersion: 'm2-v1',
      confirmedAt: '2026-08-12T01:00:00.000Z',
      version: 1,
    })
    legacy.close()

    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const nativeRequest = indexedDB.open('youju-local')
    const native = await new Promise<IDBDatabase>((resolve, reject) => {
      nativeRequest.onsuccess = () => resolve(nativeRequest.result)
      nativeRequest.onerror = () => reject(nativeRequest.error)
    })
    const transaction = native.transaction(['analysisVersions', 'aiCandidates'], 'readonly')
    const stores = {
      analysis: Array.from(transaction.objectStore('analysisVersions').indexNames).sort(),
      candidates: Array.from(transaction.objectStore('aiCandidates').indexNames).sort(),
    }
    native.close()
    return {
      version: database.version,
      evidence: await database.get('evidenceMetadata', payload.evidenceId),
      timeline: await database.get('timelineEntries', '00000000-0000-4000-8000-000000000401'),
      statement: await database.get('statementDrafts', '00000000-0000-4000-8000-000000000402'),
      confirmedStatement: await database.get(
        'confirmedStatements',
        '00000000-0000-4000-8000-000000000403',
      ),
      stores,
    }
  }, { caseId, evidenceId })

  expect(result.version).toBe(4)
  expect(result.evidence).toMatchObject({ categoryOrigin: 'manual', categoryCandidateId: null })
  expect(result.timeline).toMatchObject({ contentOrigin: 'manual', derivedFromCandidateId: null })
  expect(result.statement).toMatchObject({ contentOrigin: 'manual', derivedFromCandidateId: null })
  expect(result.confirmedStatement).toMatchObject({
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
  })
  expect(result.stores).toEqual({
    analysis: ['by_caseId'],
    candidates: ['by_analysisVersionId', 'by_caseId'],
  })
})

test('publishes candidates atomically and deletes AI records with a case', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const repository = host.__youjuAiRepo as BrowserAiRepository
      const caseRepository = host.__youjuCaseRepo as BrowserCaseRepository
      await repository.createAnalysis(payload.analysis)
      await repository.publishCompletedAnalysis(payload.completedAnalysis, [payload.candidate])
      const published = {
        analysis: await repository.getAnalysis(payload.analysis.id),
        candidates: await repository.listCandidates(payload.analysis.caseId),
      }

      await caseRepository.deleteAllCaseRecords(payload.analysis.caseId)
      return {
        published,
        afterDelete: {
          analyses: await repository.listAnalyses(payload.analysis.caseId),
          candidates: await repository.listCandidates(payload.analysis.caseId),
        },
      }
    },
    { analysis, completedAnalysis, candidate },
  )

  expect(result.published.analysis).toMatchObject({ id: analysisId, status: 'completed' })
  expect(result.published.candidates).toHaveLength(1)
  expect(result.afterDelete).toEqual({ analyses: [], candidates: [] })
})

test('rolls back an injected publication failure and marks the analysis failed', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const storage = host.__youjuStorage as BrowserStorageModule
      const database = host.__youjuDatabase as BrowserDatabase
      const repository = new storage.IndexedDbAiRepository(database, (_candidate, index) => {
        if (index === 1) {
          throw new Error('injected_publication_failure')
        }
      })
      await repository.createAnalysis(payload.analysis)

      let errorCode: string | undefined
      try {
        await repository.publishCompletedAnalysis(payload.completedAnalysis, [
          payload.candidate,
          payload.secondCandidate,
        ])
      } catch (error) {
        errorCode = (error as { code?: unknown }).code as string | undefined
      }

      return {
        errorCode,
        analysis: await repository.getAnalysis(payload.analysis.id),
        candidates: await repository.listCandidates(payload.analysis.caseId),
      }
    },
    { analysis, completedAnalysis, candidate, secondCandidate },
  )

  expect(result.errorCode).toBe('storage_unavailable')
  expect(result.analysis).toMatchObject({ id: analysisId, status: 'failed' })
  expect(result.candidates).toEqual([])
})

test('cancels only interrupted analyses and rejects sensitive records', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const repository = host.__youjuAiRepo as BrowserAiRepository
      await repository.createAnalysis(payload.analysis)
      await repository.createAnalysis({
        ...payload.analysis,
        id: payload.secondAnalysisId,
        status: 'completed',
        completedAt: '2026-08-12T01:01:00.000Z',
      })
      await repository.createAnalysis({
        ...payload.analysis,
        id: '00000000-0000-4000-8000-000000000203',
        status: 'failed',
        errorCode: 'provider_error',
      })
      const cancelledCount = await repository.cancelInterruptedAnalyses(
        '2026-08-12T02:00:00.000Z',
      )

      let apiKeyCode: string | undefined
      try {
        await repository.createAnalysis({ ...payload.analysis, apiKey: 'sentinel-key' })
      } catch (error) {
        apiKeyCode = (error as { code?: unknown }).code as string | undefined
      }

      let rawOutputCode: string | undefined
      try {
        await repository.putCandidate({ ...payload.candidate, rawModelOutput: 'sentinel-output' })
      } catch (error) {
        rawOutputCode = (error as { code?: unknown }).code as string | undefined
      }

      let derivedBytesCode: string | undefined
      try {
        await repository.putCandidate({ ...payload.candidate, derivedBytes: new Uint8Array([1]) })
      } catch (error) {
        derivedBytesCode = (error as { code?: unknown }).code as string | undefined
      }

      return {
        cancelledCount,
        statuses: await Promise.all([
          repository.getAnalysis(payload.analysis.id),
          repository.getAnalysis(payload.secondAnalysisId),
          repository.getAnalysis('00000000-0000-4000-8000-000000000203'),
        ]),
        apiKeyCode,
        rawOutputCode,
        derivedBytesCode,
        candidates: await repository.listCandidates(payload.analysis.caseId),
      }
    },
    { analysis, candidate, secondAnalysisId },
  )

  expect(result.cancelledCount).toBe(1)
  expect(result.statuses).toEqual([
    expect.objectContaining({ status: 'cancelled', errorCode: 'request_cancelled' }),
    expect.objectContaining({ status: 'completed' }),
    expect.objectContaining({ status: 'failed' }),
  ])
  expect(result.apiKeyCode).toBe('invalid_ai_record')
  expect(result.rawOutputCode).toBe('invalid_ai_record')
  expect(result.derivedBytesCode).toBe('invalid_ai_record')
  expect(result.candidates).toEqual([])
})

test('confirms every candidate type with formal provenance in one transaction', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const repository = host.__youjuAiRepo as BrowserAiRepository
      const caseRepository = host.__youjuCaseRepo as BrowserCaseRepository
      const database = host.__youjuDatabase as BrowserDatabase
      await database.put('evidenceMetadata', {
        id: payload.evidenceId,
        caseId: payload.caseId,
        originalName: 'order.png',
        mediaType: 'image/png',
        size: 1,
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        importedAt: '2026-08-12T01:00:00.000Z',
        sourceCreatedAt: null,
        category: 'other',
        categoryOrigin: 'manual',
        categoryCandidateId: null,
        storageRef: 'cases/example/evidence/order',
        isOriginalPreserved: true,
        metadata: {},
      })
      const classification = {
        ...payload.candidate,
        id: '00000000-0000-4000-8000-000000000311',
        candidateType: 'classification',
        evidenceId: payload.evidenceId,
        category: 'order_record',
        value: '订单截图',
        normalizedValue: 'order_record',
      }
      const timeline = {
        ...payload.candidate,
        id: '00000000-0000-4000-8000-000000000312',
        candidateType: 'timeline',
        occurredAt: '2026-08-12T01:00:00.000Z',
        timePrecision: 'minute',
        summary: '收到破损商品',
        detail: null,
      }
      const statement = {
        ...payload.candidate,
        id: '00000000-0000-4000-8000-000000000313',
        candidateType: 'statement',
        text: '商家拒绝退款',
        confirmedFactIds: [],
        confirmedTimelineEntryIds: [],
      }
      await repository.createAnalysis(payload.analysis)
      await repository.publishCompletedAnalysis(payload.completedAnalysis, [
        payload.candidate,
        classification,
        timeline,
        statement,
      ])

      await repository.confirmCandidate(
        {
          type: 'fact',
          candidateId: payload.candidate.id,
          editedValue: '90000',
          confirmedFactId: '00000000-0000-4000-8000-000000000501',
          replacesFactId: null,
          reviewedAt: '2026-08-12T02:00:00.000Z',
        },
        'm3-rule-v1',
      )
      await repository.confirmCandidate(
        {
          type: 'classification',
          candidateId: classification.id,
          editedCategory: 'other',
          reviewedAt: '2026-08-12T02:01:00.000Z',
        },
        'm3-rule-v1',
      )
      await repository.confirmCandidate(
        {
          type: 'timeline',
          candidateId: timeline.id,
          edited: { summary: '手工确认收到破损商品' },
          timelineEntryId: '00000000-0000-4000-8000-000000000601',
          reviewedAt: '2026-08-12T02:02:00.000Z',
        },
        'm3-rule-v1',
      )
      await repository.confirmCandidate(
        {
          type: 'statement',
          candidateId: statement.id,
          editedText: '手工确认商家拒绝退款',
          statementDraftId: '00000000-0000-4000-8000-000000000701',
          reviewedAt: '2026-08-12T02:03:00.000Z',
        },
        'm3-rule-v1',
      )

      const confirmedEvidence = await database.get('evidenceMetadata', payload.evidenceId)
      const confirmedStatement = await database.get(
        'statementDrafts',
        '00000000-0000-4000-8000-000000000701',
      )
      await caseRepository.updateEvidenceCategory(payload.caseId, payload.evidenceId, 'order_record')
      const currentStatement = await database.get(
        'statementDrafts',
        '00000000-0000-4000-8000-000000000701',
      )
      if (currentStatement !== undefined) {
        await caseRepository.putStatementDraft({
          ...currentStatement,
          content: '手工独立编辑陈述',
        })
      }

      return {
        fact: await database.get('confirmedFacts', '00000000-0000-4000-8000-000000000501'),
        evidence: confirmedEvidence,
        timeline: await database.get('timelineEntries', '00000000-0000-4000-8000-000000000601'),
        statement: confirmedStatement,
        candidates: await Promise.all([
          repository.getCandidate(payload.candidate.id),
          repository.getCandidate(classification.id),
          repository.getCandidate(timeline.id),
          repository.getCandidate(statement.id),
        ]),
        manuallyUpdatedEvidence: await database.get('evidenceMetadata', payload.evidenceId),
        manuallyUpdatedStatement: await database.get(
          'statementDrafts',
          '00000000-0000-4000-8000-000000000701',
        ),
      }
    },
    { analysis, completedAnalysis, candidate, caseId, evidenceId },
  )

  expect(result.fact).toMatchObject({
    confirmationMethod: 'candidate_edited',
    derivedFromCandidateId: candidateId,
  })
  expect(result.evidence).toMatchObject({
    category: 'other',
    categoryOrigin: 'candidate_edited',
    categoryCandidateId: '00000000-0000-4000-8000-000000000311',
  })
  expect(result.timeline).toMatchObject({
    contentOrigin: 'candidate_edited',
    derivedFromCandidateId: '00000000-0000-4000-8000-000000000312',
    status: 'confirmed',
  })
  expect(result.statement).toMatchObject({
    contentOrigin: 'candidate_edited',
    derivedFromCandidateId: '00000000-0000-4000-8000-000000000313',
  })
  expect(result.candidates).toEqual([
    expect.objectContaining({ reviewStatus: 'edited_and_confirmed' }),
    expect.objectContaining({ reviewStatus: 'edited_and_confirmed' }),
    expect.objectContaining({ reviewStatus: 'edited_and_confirmed' }),
    expect.objectContaining({ reviewStatus: 'edited_and_confirmed' }),
  ])
  expect(result.manuallyUpdatedEvidence).toMatchObject({
    category: 'order_record',
    categoryOrigin: 'manual',
    categoryCandidateId: null,
  })
  expect(result.manuallyUpdatedStatement).toMatchObject({
    content: '手工独立编辑陈述',
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
  })
})

test('rolls back both candidate and formal record when confirmation fails', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const storage = host.__youjuStorage as BrowserStorageModule
      const database = host.__youjuDatabase as BrowserDatabase
      const repository = new storage.IndexedDbAiRepository(
        database,
        undefined,
        (step) => {
          if (step === 'formal') {
            throw new Error('injected_confirmation_failure')
          }
        },
      )
      await database.put('evidenceMetadata', {
        id: payload.evidenceId,
        caseId: payload.caseId,
        originalName: 'order.png',
        mediaType: 'image/png',
        size: 1,
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        importedAt: '2026-08-12T01:00:00.000Z',
        sourceCreatedAt: null,
        category: 'other',
        categoryOrigin: 'manual',
        categoryCandidateId: null,
        storageRef: 'cases/example/evidence/order',
        isOriginalPreserved: true,
        metadata: {},
      })
      await repository.createAnalysis(payload.analysis)
      await repository.publishCompletedAnalysis(payload.completedAnalysis, [payload.candidate])

      let errorCode: string | undefined
      try {
        await repository.confirmCandidate(
          {
            type: 'fact',
            candidateId: payload.candidate.id,
            confirmedFactId: '00000000-0000-4000-8000-000000000501',
            replacesFactId: null,
            reviewedAt: '2026-08-12T02:00:00.000Z',
          },
          'm3-rule-v1',
        )
      } catch (error) {
        errorCode = (error as { code?: unknown }).code as string | undefined
      }
      return {
        errorCode,
        candidate: await repository.getCandidate(payload.candidate.id),
        fact: await database.get('confirmedFacts', '00000000-0000-4000-8000-000000000501'),
      }
    },
    { analysis, completedAnalysis, candidate, caseId, evidenceId },
  )

  expect(result.errorCode).toBe('storage_unavailable')
  expect(result.candidate).toMatchObject({ reviewStatus: 'pending' })
  expect(result.fact).toBeUndefined()
})

test('blocks deleting an analysis referenced by formal records', async ({ page }) => {
  await openRepositories(page)

  const result = await page.evaluate(
    async (payload) => {
      const host = window as unknown as BrowserWindow
      const repository = host.__youjuAiRepo as BrowserAiRepository
      const database = host.__youjuDatabase as BrowserDatabase
      await repository.createAnalysis(payload.analysis)
      await repository.putCandidate(payload.candidate)
      await database.put('confirmedFacts', {
        id: '00000000-0000-4000-8000-000000000501',
        caseId: payload.caseId,
        factType: 'payment',
        fieldName: 'paid_amount',
        value: '89900',
        sourceRefs: [{ evidenceId: payload.evidenceId }],
        confirmedAt: '2026-08-12T02:00:00.000Z',
        confirmationMethod: 'candidate_confirmed',
        derivedFromCandidateId: payload.candidate.id,
        replacesFactId: null,
        version: 1,
      })
      let code: string | undefined
      try {
        await repository.deleteAnalysis(payload.analysis.id)
      } catch (error) {
        code = (error as { code?: unknown }).code as string | undefined
      }
      return {
        code,
        analysis: await repository.getAnalysis(payload.analysis.id),
        candidates: await repository.listCandidates(payload.caseId),
      }
    },
    { analysis, candidate, caseId, evidenceId },
  )

  expect(result).toMatchObject({
    code: 'analysis_is_referenced',
    analysis: { id: analysisId },
  })
  expect(result.candidates).toHaveLength(1)
})
