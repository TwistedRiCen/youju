import { describe, expect, it, vi } from 'vitest'
import type { AiTaskOutput, InputManifest } from '@youju/ai-core'
import type { AnalysisVersion, ConfirmedFact, TimelineEntry } from '@youju/domain'
import {
  createAiTaskRunner,
  type AiTaskRunner,
  type RunAiTaskCommand,
} from '../src/ai/ai-task-runner.js'
import type { AiApiClient, AiTaskRequest, AiTaskResult } from '../src/ai/ai-api-client.js'
import { recoverLocalOperations } from '../src/services/recover-local-operations.js'

const caseId = '00000000-0000-4000-8000-000000000801'
const evidenceId = '00000000-0000-4000-8000-000000000802'
const sourceToken = '00000000-0000-4000-8000-000000000803'
const secondSourceToken = '00000000-0000-4000-8000-000000000804'
const startedAt = '2026-08-12T10:00:00.000Z'
const completedAt = '2026-08-12T10:00:01.000Z'

const provider = {
  providerPreset: 'openai' as const,
  protocol: 'responses' as const,
  baseUrl: 'https://api.example.test/v1',
  modelName: 'fictional-model',
  apiKey: 'fictional-api-key-sentinel-task-11',
  capabilities: {
    text: true,
    vision: true,
    jsonMode: true,
    jsonSchema: true,
    streaming: false,
  },
}

const manifest = (taskType: InputManifest['taskType'], second = false): InputManifest => ({
  taskId: second ? secondSourceToken : sourceToken,
  caseId,
  title: 'fictional local title',
  taskType,
  providerPreset: provider.providerPreset,
  protocol: provider.protocol,
  baseUrlFingerprint: 'sha256:fictional-provider',
  modelName: provider.modelName,
  items: [{
    sourceToken: second ? secondSourceToken : sourceToken,
    evidenceId,
    originalName: 'fictional-original.png',
    page: 1,
    derivedMediaType: 'image/webp',
    pixelWidth: 100,
    pixelHeight: 100,
    byteSize: 2,
    derivedSha256: 'a'.repeat(64),
  }],
  batchCount: 1,
  totalDerivedBytes: 2,
})

const media = (token = sourceToken) => [{
  sourceToken: token,
  evidenceId,
  page: 1,
  mediaType: 'image/webp' as const,
  width: 100,
  height: 100,
  bytes: new Uint8Array([1, 2]),
  sha256: 'a'.repeat(64),
  previewUrl: 'blob:fictional-preview',
}]

function output(taskType: InputManifest['taskType'], token = sourceToken): AiTaskOutput {
  switch (taskType) {
    case 'classify_evidence':
      return { classifications: [{ sourceToken: token, category: 'other', confidenceLevel: 'high' }], warnings: [] }
    case 'extract_facts':
      return { facts: [{ factType: 'issue', fieldName: 'problem_description', value: 'fictional issue', normalizedValue: 'fictional issue', confidenceLevel: 'high', sources: [{ sourceToken: token }] }], uncertainties: [], warnings: [] }
    case 'build_timeline':
      return { entries: [{ occurredAt: null, timePrecision: 'unknown', summary: 'fictional event', detail: null, confidenceLevel: 'high', sources: [{ sourceToken: token }] }], uncertainties: [], warnings: [] }
    case 'draft_statement':
      return { text: 'fictional statement draft', confirmedFactIds: ['00000000-0000-4000-8000-000000000811'], confirmedTimelineEntryIds: ['00000000-0000-4000-8000-000000000812'], warnings: [] }
  }
}

class MemoryAiRepository {
  readonly analyses: AnalysisVersion[] = []
  readonly publications: { version: AnalysisVersion; candidates: readonly unknown[] }[] = []
  readonly updates: AnalysisVersion[] = []
  interruptedCancelled = 0

  async createAnalysis(version: AnalysisVersion): Promise<void> { this.analyses.push(version) }
  async updateAnalysis(version: AnalysisVersion): Promise<void> {
    this.updates.push(version)
    const index = this.analyses.findIndex((item) => item.id === version.id)
    if (index >= 0) this.analyses[index] = version
  }
  async publishCompletedAnalysis(version: AnalysisVersion, candidates: readonly unknown[]): Promise<void> {
    this.publications.push({ version, candidates })
    await this.updateAnalysis(version)
  }
  async cancelInterruptedAnalyses(_cancelledAt: string): Promise<number> {
    void _cancelledAt
    this.interruptedCancelled += 1
    return 1
  }
}

function repository(): MemoryAiRepository {
  return new MemoryAiRepository()
}

function command(taskType: InputManifest['taskType'], overrides: Partial<RunAiTaskCommand> = {}): RunAiTaskCommand {
  return {
    caseId,
    taskType,
    provider,
    manifest: manifest(taskType),
    derivedMedia: media(),
    consentGranted: true,
    ...overrides,
  }
}

function runnerWith(
  aiRepository: MemoryAiRepository,
  executeTask: (request: AiTaskRequest, signal: AbortSignal) => Promise<AiTaskResult>,
  caseRepository?: { listConfirmedFacts: () => Promise<readonly ConfirmedFact[]>; listTimeline: () => Promise<readonly TimelineEntry[]> },
): AiTaskRunner {
  return createAiTaskRunner({
    aiRepository: aiRepository as never,
    caseRepository: caseRepository as never,
    client: { testConnection: vi.fn(), executeTask } satisfies AiApiClient,
    now: () => startedAt,
    idFactory: (() => {
      let next = 820
      return () => `00000000-0000-4000-8000-000000000${String(next++).padStart(3, '0')}`
    })(),
    releaseDerivedMedia: vi.fn(),
  })
}

describe('browser AI task runner', () => {
  it('does not persist or call the client before consent, then creates a running version after consent', async () => {
    const aiRepository = repository()
    const executeTask = vi.fn(async (request: AiTaskRequest): Promise<AiTaskResult> => ({ requestId: request.requestId, taskType: request.manifest.taskType, output: output(request.manifest.taskType, request.manifest.items[0]?.sourceToken), usage: null, repairAttempted: true, providerRequestIdFingerprint: null }))
    const runner = runnerWith(aiRepository, executeTask)

    await expect(runner.runTask(command('classify_evidence', { consentGranted: false }))).resolves.toMatchObject({ status: 'awaiting_consent' })
    expect(aiRepository.analyses).toHaveLength(0)
    await expect(runner.runTask(command('classify_evidence'))).resolves.toMatchObject({ status: 'completed' })
    expect(aiRepository.analyses[0]).toMatchObject({ status: 'completed', repairAttempted: true })
    expect(JSON.stringify(aiRepository.analyses[0])).not.toContain('fictional-api-key-sentinel-task-11')
    expect(executeTask).toHaveBeenCalledTimes(1)
  })

  it('publishes no candidates when a batch fails and releases derived media', async () => {
    const aiRepository = repository()
    const release = vi.fn()
    let calls = 0
    const runner = createAiTaskRunner({
      aiRepository: aiRepository as never,
      client: {
        testConnection: vi.fn(),
        executeTask: vi.fn(async (request: AiTaskRequest): Promise<AiTaskResult> => {
          calls += 1
          if (calls === 2) throw new Error('fictional provider detail')
          return { requestId: request.requestId, taskType: request.manifest.taskType, output: output('classify_evidence', request.manifest.items[0]?.sourceToken), usage: null, repairAttempted: false, providerRequestIdFingerprint: null }
        }),
      },
      now: () => startedAt,
      idFactory: vi.fn(() => `00000000-0000-4000-8000-000000000${String(830 + calls).padStart(3, '0')}`),
      releaseDerivedMedia: release,
    })
    const twoBatchManifest: InputManifest = {
      ...manifest('classify_evidence'),
      items: Array.from({ length: 11 }, (_item, index) => ({
        ...manifest('classify_evidence').items[0]!,
        sourceToken: `00000000-0000-4000-8000-000000000${String(840 + index).padStart(3, '0')}`,
        byteSize: 2 * 1024 * 1024,
      })),
      batchCount: 2,
      totalDerivedBytes: 22 * 1024 * 1024,
    }

    const result = await runner.runTask(command('classify_evidence', { manifest: twoBatchManifest, derivedMedia: [] }))
    expect(result).toMatchObject({ status: 'failed', errorCode: 'provider_unreachable' })
    expect(aiRepository.publications).toHaveLength(0)
    expect(release).toHaveBeenCalled()
  })

  it('serializes one-click analysis into three independent versions and excludes statements', async () => {
    const aiRepository = repository()
    const calls: string[] = []
    const runner = runnerWith(aiRepository, vi.fn(async (request: AiTaskRequest): Promise<AiTaskResult> => {
      calls.push(request.manifest.taskType)
      return { requestId: request.requestId, taskType: request.manifest.taskType, output: output(request.manifest.taskType), usage: null, repairAttempted: false, providerRequestIdFingerprint: null }
    }))

    const results = await runner.runQuickAnalysis({
      caseId,
      consentGranted: true,
      createTask: async (taskType) => command(taskType),
    })

    expect(calls).toEqual(['classify_evidence', 'extract_facts', 'build_timeline'])
    expect(results).toHaveLength(3)
    expect(new Set(results.map((item) => item.analysis?.id)).size).toBe(3)
  })

  it('uses current confirmed facts and timeline for statement drafting without derived media', async () => {
    const aiRepository = repository()
    const fact = { id: '00000000-0000-4000-8000-000000000811', caseId, factType: 'issue', fieldName: 'problem_description', value: 'confirmed issue', confirmedAt: completedAt, replacesFactId: null, version: 1, confirmationMethod: 'manual', derivedFromCandidateId: null, sourceRefs: [] } as unknown as ConfirmedFact
    const timeline = { id: '00000000-0000-4000-8000-000000000812', caseId, occurredAt: null, timePrecision: 'unknown', summary: 'confirmed event', detail: null, sourceRefs: [], contentOrigin: 'manual', derivedFromCandidateId: null, status: 'confirmed', sortOrder: 0 } as unknown as TimelineEntry
    let received: Parameters<NonNullable<Parameters<typeof createAiTaskRunner>[0]['client']['executeTask']>>[0] | undefined
    const runner = runnerWith(aiRepository, async (request: AiTaskRequest) => {
      received = request
      return { requestId: request.requestId, taskType: request.manifest.taskType, output: output('draft_statement'), usage: null, repairAttempted: false, providerRequestIdFingerprint: null }
    }, {
      listConfirmedFacts: async () => [fact],
      listTimeline: async () => [timeline],
    })

    await runner.runTask(command('draft_statement', { derivedMedia: [] }))
    expect(received?.images).toHaveLength(0)
    expect(received?.inputText).toContain(fact.id)
    expect(received?.inputText).toContain(timeline.id)
    expect(received?.inputText).not.toContain('derivedFromCandidateId')
  })

  it('keeps earlier one-click stages after a later stage fails', async () => {
    const aiRepository = repository()
    const runner = runnerWith(aiRepository, async (request: AiTaskRequest): Promise<AiTaskResult> => {
      if (request.manifest.taskType === 'extract_facts') throw new Error('fictional later-stage failure')
      return { requestId: request.requestId, taskType: request.manifest.taskType, output: output(request.manifest.taskType), usage: null, repairAttempted: false, providerRequestIdFingerprint: null }
    })

    const results = await runner.runQuickAnalysis({ caseId, consentGranted: true, createTask: async (taskType) => command(taskType) })
    expect(results.map((item) => item.status)).toEqual(['completed', 'failed'])
    expect(aiRepository.publications).toHaveLength(1)
  })

  it('enforces one running task per case and cancellation prevents publication', async () => {
    const aiRepository = repository()
    let resolve: (() => void) | undefined
    const runner = runnerWith(aiRepository, (request: AiTaskRequest, signal: AbortSignal) => new Promise<AiTaskResult>((resolvePromise, reject) => {
      resolve = () => resolvePromise({ requestId: request.requestId, taskType: request.manifest.taskType, output: output(request.manifest.taskType), usage: null, repairAttempted: false, providerRequestIdFingerprint: null })
      signal.addEventListener('abort', () => reject(new Error('request_cancelled')))
    }))
    const first = runner.runTask(command('classify_evidence'))
    await vi.waitFor(() => expect(runner.isRunning(caseId)).toBe(true))
    await expect(runner.runTask(command('extract_facts'))).rejects.toMatchObject({ code: 'task_already_running' })
    runner.cancel(caseId)
    await expect(first).resolves.toMatchObject({ status: 'cancelled', errorCode: 'request_cancelled' })
    expect(aiRepository.publications).toHaveLength(0)
    resolve?.()
  })

  it('cancels interrupted persisted versions during startup without replaying requests', async () => {
    const aiRepository = repository()
    const executeTask = vi.fn()
    await recoverLocalOperations({
      repository: { listOperations: async () => [] } as never,
      blobStore: {} as never,
      aiRepository: aiRepository as never,
      now: () => completedAt,
    })
    expect(aiRepository.interruptedCancelled).toBe(1)
    expect(executeTask).not.toHaveBeenCalled()
  })
})
