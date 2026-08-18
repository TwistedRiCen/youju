import { expect, test } from '@playwright/test'

test('loads, persists, de-duplicates, and resets the same-origin public demo in real browser storage', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  requests.length = 0

  const result = await page.evaluate(async () => {
    const caseServiceUrl = '/src/services/case-service.ts'
    const caseService = (await import(caseServiceUrl)) as {
      getCaseRepository(): Promise<{
        createCase(caseEvent: Record<string, unknown>, drafts: readonly unknown[], writerId: string): Promise<unknown>
        getCase(caseId: string): Promise<unknown | null>
        listCases(): Promise<readonly { caseEvent: { id: string; dataOrigin: string; demoFixtureId: string | null } }[]>
        listEvidence(caseId: string): Promise<readonly { id: string; caseId: string; storageRef: string; size: number; sha256: string }[]>
        listConfirmedFacts(caseId: string): Promise<readonly { id: string; caseId: string; sourceRefs: readonly { evidenceId: string }[] }[]>
        listTimeline(caseId: string): Promise<readonly { id: string; caseId: string; sourceRefs: readonly { evidenceId: string }[] }[]>
        listConfirmedStatements(caseId: string): Promise<readonly { id: string; confirmedFactIds: readonly string[]; confirmedTimelineEntryIds: readonly string[] }[]>
        listAnalyses(caseId: string): Promise<readonly unknown[]>
        listCandidates(caseId: string): Promise<readonly unknown[]>
      }>
    }
    const demoUrl = '/src/demo/index.ts'
    const demo = (await import(demoUrl)) as {
      loadDemoCase(fixtureId: string): Promise<{ status: string; caseId: string }>
      resetDemoCase(fixtureId: string): Promise<{ status: string; caseId: string }>
    }
    const evidenceUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidenceModule = (await import(evidenceUrl)) as {
      OpfsEvidenceBlobStore: new () => {
        read(storageRef: string): Promise<Blob>
        listCaseStorageRefs(caseId: string): Promise<readonly string[]>
      }
    }
    const hashUrl = '/node_modules/@youju/evidence-hash/src/index.ts'
    const hashModule = (await import(hashUrl)) as { sha256Blob(blob: Blob): Promise<string> }

    const repository = await caseService.getCaseRepository()
    const userCaseId = crypto.randomUUID()
    const now = new Date().toISOString()
    await repository.createCase({
      id: userCaseId,
      scenarioType: 'ecommerce_refund',
      title: '用户创建事件',
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      requestedResolution: null,
      storageMode: 'local',
      schemaVersion: 2,
      dataOrigin: 'user_created',
      demoFixtureId: null,
    }, [], 'e2e')

    const first = await demo.loadDemoCase('m4-ecommerce-refund-demo-v1')
    const duplicate = await demo.loadDemoCase('m4-ecommerce-refund-demo-v1')
    const reset = await demo.resetDemoCase('m4-ecommerce-refund-demo-v1')
    const evidence = await repository.listEvidence(reset.caseId)
    const facts = await repository.listConfirmedFacts(reset.caseId)
    const timeline = await repository.listTimeline(reset.caseId)
    const statements = await repository.listConfirmedStatements(reset.caseId)
    const evidenceIds = new Set(evidence.map(({ id }) => id))
    const factIds = new Set(facts.map(({ id }) => id))
    const timelineIds = new Set(timeline.map(({ id }) => id))
    const blobStore = new evidenceModule.OpfsEvidenceBlobStore()
    const blobChecks = await Promise.all(evidence.map(async (item) => {
      const blob = await blobStore.read(item.storageRef)
      return blob.size === item.size && await hashModule.sha256Blob(blob) === item.sha256
    }))

    return {
      first,
      duplicate,
      reset,
      cases: await repository.listCases(),
      userPreserved: await repository.getCase(userCaseId) !== null,
      oldDemoGone: await repository.getCase(first.caseId) === null,
      oldBlobRefs: await blobStore.listCaseStorageRefs(first.caseId),
      counts: { evidence: evidence.length, facts: facts.length, timeline: timeline.length, statements: statements.length },
      childCasesMatch: [...evidence, ...facts, ...timeline].every((item) => item.caseId === reset.caseId),
      sourcesResolve: [...facts, ...timeline].every((item) => item.sourceRefs.every(({ evidenceId }) => evidenceIds.has(evidenceId))),
      statementRefsResolve: statements.every((statement) =>
        statement.confirmedFactIds.every((id) => factIds.has(id)) &&
        statement.confirmedTimelineEntryIds.every((id) => timelineIds.has(id)),
      ),
      blobChecks,
      analysisCount: (await repository.listAnalyses(reset.caseId)).length,
      candidateCount: (await repository.listCandidates(reset.caseId)).length,
    }
  })

  expect(result.first.status).toBe('loaded')
  expect(result.duplicate).toEqual({ status: 'existing', caseId: result.first.caseId })
  expect(result.reset.status).toBe('loaded')
  expect(result.reset.caseId).not.toBe(result.first.caseId)
  expect(result.cases).toHaveLength(2)
  expect(result.cases.map(({ caseEvent }) => caseEvent.dataOrigin).sort()).toEqual([
    'fictional_demo',
    'user_created',
  ])
  expect(result.userPreserved).toBe(true)
  expect(result.oldDemoGone).toBe(true)
  expect(result.oldBlobRefs).toEqual([])
  expect(result.counts).toEqual({ evidence: 4, facts: 6, timeline: 4, statements: 1 })
  expect(result.childCasesMatch).toBe(true)
  expect(result.sourcesResolve).toBe(true)
  expect(result.statementRefsResolve).toBe(true)
  expect(result.blobChecks).toEqual([true, true, true, true])
  expect(result.analysisCount).toBe(0)
  expect(result.candidateCount).toBe(0)

  const demoRequests = requests.filter((url) => url.includes('/demo/m4-ecommerce-refund-demo-v1/'))
  expect(demoRequests).toHaveLength(10)
  expect(requests.some((url) => url.includes('/ai/'))).toBe(false)
  expect(requests.every((url) => new URL(url).origin === new URL(requests[0]!).origin)).toBe(true)
})
