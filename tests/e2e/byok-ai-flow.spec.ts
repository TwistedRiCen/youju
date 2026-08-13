import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const fixtureDirectory = new URL(
  '../../fixtures/ecommerce-refund/case-001-transport-damage/ai/',
  import.meta.url,
)
const responsesClassification = JSON.parse(
  readFileSync(new URL('responses-classification.json', fixtureDirectory), 'utf8'),
) as Record<string, unknown>
const chatFacts = JSON.parse(readFileSync(new URL('chat-facts.json', fixtureDirectory), 'utf8')) as Record<string, unknown>
const chatTimeline = JSON.parse(readFileSync(new URL('chat-timeline.json', fixtureDirectory), 'utf8')) as Record<string, unknown>
const chatStatement = JSON.parse(readFileSync(new URL('chat-statement.json', fixtureDirectory), 'utf8')) as Record<string, unknown>

const taskFixtures: Readonly<Record<string, Record<string, unknown>>> = {
  classify_evidence: responsesClassification,
  extract_facts: chatFacts,
  build_timeline: chatTimeline,
  draft_statement: chatStatement,
}

async function installMockAiRoute(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/ai/')) {
      await route.continue()
      return
    }
    const body = JSON.parse(request.postData() ?? '{}') as { requestId?: string; manifest?: { taskType?: string } }
    const taskType = body.manifest?.taskType ?? 'classify_evidence'
    const fixture = taskFixtures[taskType] ?? responsesClassification
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: body.requestId ?? '00000000-0000-4000-8000-000000000901',
        taskType,
        providerPreset: url.searchParams.get('providerPreset') ?? fixture.providerPreset,
        protocol: url.searchParams.get('protocol') ?? fixture.protocol,
        output: fixture.output,
        usage: null,
        repairAttempted: false,
        providerRequestIdFingerprint: null,
      }),
    })
  })
}

test.describe('Mock-only BYOK AI flow', () => {
  test('intercepts same-origin Responses and Chat Completions tasks without public requests', async ({ page }) => {
    const publicRequests: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (/^https:\/\/(?:api\.openai\.com|dashscope\.aliyuncs\.com|api\.deepseek\.com|api\.siliconflow\.cn)/i.test(url)) {
        publicRequests.push(url)
      }
    })
    await installMockAiRoute(page)

    await page.goto('/')
    const result = await page.evaluate(async () => {
      const response = await fetch('/ai/tasks/classify_evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000901', manifest: { taskType: 'classify_evidence' } }),
      })
      return { status: response.status, body: await response.json() as { taskType?: string } }
    })
    expect(result).toEqual({ status: 200, body: expect.objectContaining({ taskType: 'classify_evidence' }) })
    expect(publicRequests).toEqual([])
  })

  test('runs every single task and the quick-analysis sequence with fixed Chat Completions outputs', async ({ page }) => {
    await installMockAiRoute(page)
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const taskTypes = ['classify_evidence', 'extract_facts', 'build_timeline', 'draft_statement']
      const single = []
      for (const [index, taskType] of taskTypes.entries()) {
        const protocol = taskType === 'classify_evidence' ? 'responses' : 'chat_completions'
        const response = await fetch(`/ai/tasks/${taskType}?providerPreset=openai&protocol=${protocol}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requestId: `00000000-0000-4000-8000-00000000090${index + 2}`,
            manifest: { taskType },
          }),
        })
        single.push({ status: response.status, taskType: (await response.json() as { taskType?: string }).taskType })
      }
      const quick = []
      for (const taskType of taskTypes.slice(0, 3)) {
        const response = await fetch(`/ai/tasks/${taskType}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ manifest: { taskType } }),
        })
        quick.push(response.status)
      }
      return { single, quick }
    })
    expect(result.single).toEqual([
      { status: 200, taskType: 'classify_evidence' },
      { status: 200, taskType: 'extract_facts' },
      { status: 200, taskType: 'build_timeline' },
      { status: 200, taskType: 'draft_statement' },
    ])
    expect(result.quick).toEqual([200, 200, 200])
  })

  test('requires strict consent, narrows session convenience, and invalidates consent on provider changes', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const module = await import('/src/ai/index.ts')
      const scope = {
        caseId: '00000000-0000-4000-8000-000000000001',
        providerPreset: 'openai',
        protocol: 'responses',
        baseUrlFingerprint: 'sha256:fictional-provider',
        modelName: 'fictional-model',
        selectedEvidencePages: [{ evidenceId: '00000000-0000-4000-8000-000000000101', pages: [1, 2] }],
        textFieldNames: ['problem_description'],
        securityPolicyVersion: 'm3-network-policy-v1',
        maxDerivedBytes: 1024,
        capabilities: { text: true, vision: true, jsonMode: true, jsonSchema: true, streaming: true },
        capabilityTestedAt: '2026-08-12T08:00:00.000Z',
      } as const
      module.disableAi()
      module.setAiSession({ ...scope, baseUrl: 'https://fictional.test/v1', apiKey: 'fictional-session-key', consentMode: 'session_convenience', connectionTestedAt: scope.capabilityTestedAt })
      const strictBeforeConsent = module.requiresFullConsent(scope)
      module.recordConsent(scope)
      const narrowed = module.requiresFullConsent({ ...scope, selectedEvidencePages: [{ ...scope.selectedEvidencePages[0], pages: [1] }], textFieldNames: [] })
      const changedProvider = module.requiresFullConsent({ ...scope, modelName: 'another-fictional-model' })
      module.disableAi()
      return { strictBeforeConsent, narrowed, changedProvider, afterDisable: module.getAiSession() }
    })
    expect(result).toEqual({ strictBeforeConsent: true, narrowed: false, changedProvider: true, afterDisable: null })
  })

  test('keeps eligible batch confirmation and formal export limited to confirmed records', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const module = await import('/node_modules/@youju/ai-core/src/index.ts')
      const candidate = {
        id: '00000000-0000-4000-8000-000000000301', caseId: '00000000-0000-4000-8000-000000000001', analysisVersionId: '00000000-0000-4000-8000-000000000201', candidateType: 'fact', origin: 'ai', reviewStatus: 'pending', createdAt: '2026-08-12T08:00:00.000Z', confidenceLevel: 'high', sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000101' }], sourceLocations: [{ evidenceId: '00000000-0000-4000-8000-000000000101', page: 1, pixelWidth: 100, pixelHeight: 100 }], factType: 'payment', fieldName: 'paid_amount', value: '899.00', normalizedValue: '89900',
      } as const
      const context = { analysisStatus: 'completed', authorizedSources: candidate.sourceLocations, conflicts: [], materialsReady: true, schemaValid: true }
      const eligible = module.canBatchConfirm(candidate, context)
      const confirmed = module.transitionReview(candidate, { type: 'confirm', reviewedAt: '2026-08-12T08:01:00.000Z' })
      const edited = module.transitionReview(candidate, { type: 'edit_and_confirm', reviewedAt: '2026-08-12T08:02:00.000Z' })
      const rejected = module.transitionReview(candidate, { type: 'reject', reviewedAt: '2026-08-12T08:03:00.000Z' })
      const conflicted = module.transitionReview(candidate, { type: 'mark_conflicted', conflictType: 'candidate_value_conflict', reviewedAt: '2026-08-12T08:04:00.000Z' })
      const conflictEdited = module.transitionReview(conflicted, { type: 'edit_and_confirm', reviewedAt: '2026-08-12T08:05:00.000Z' })
      return { eligible, statuses: [confirmed.reviewStatus, edited.reviewStatus, rejected.reviewStatus, conflicted.reviewStatus, conflictEdited.reviewStatus] }
    })
    expect(result).toEqual({ eligible: true, statuses: ['confirmed', 'edited_and_confirmed', 'rejected', 'conflicted', 'edited_and_confirmed'] })
  })
})
