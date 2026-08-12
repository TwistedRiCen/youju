import {
  localizeTaskOutput,
  splitManifestBatches,
  type AiCandidate,
  type AiTaskType,
  type InputManifest,
  type ProviderCapabilities,
  type ProviderErrorCode,
  type ProviderPreset,
  type AiProtocol,
} from '@youju/ai-core'
import { sha256Hex } from '@youju/evidence-hash'
import type {
  AnalysisVersion,
  ConfirmedFact,
  TimelineEntry,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'
import type { AiRepository } from '../storage/ai-repository.js'
import type { CaseRepository } from '../storage/case-repository.js'
import { releaseDerivedMedia, type DerivedMedia } from './derived-media.js'
import {
  AiApiClientError,
  type AiApiClient,
  type AiTaskRequest,
  type AiTaskResult,
} from './ai-api-client.js'

const SECURITY_POLICY_VERSION = 'm3-network-policy-v1'
const OUTPUT_SCHEMA_VERSION = 1
const PROMPT_VERSIONS: Readonly<Record<AiTaskType, string>> = {
  classify_evidence: 'classify-evidence-v1',
  extract_facts: 'extract-facts-v1',
  build_timeline: 'build-timeline-v1',
  draft_statement: 'draft-statement-v1',
}

export interface AiProviderSessionInput {
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrl: string
  readonly modelName: string
  readonly apiKey: string
  readonly capabilities: ProviderCapabilities
}

export interface RunAiTaskCommand {
  readonly caseId: UuidV4
  readonly taskType: AiTaskType
  readonly provider: AiProviderSessionInput
  readonly manifest: InputManifest
  readonly derivedMedia: readonly DerivedMedia[]
  readonly consentGranted: boolean
  readonly inputText?: string
}

export interface RunQuickAnalysisCommand {
  readonly caseId: UuidV4
  readonly consentGranted: boolean
  readonly createTask: (taskType: Exclude<AiTaskType, 'draft_statement'>) => Promise<RunAiTaskCommand>
}

export type RunAiTaskResult =
  | { readonly status: 'awaiting_consent'; readonly analysis: null; readonly candidates: readonly AiCandidate[] }
  | { readonly status: 'completed'; readonly analysis: AnalysisVersion; readonly candidates: readonly AiCandidate[] }
  | { readonly status: 'failed' | 'cancelled'; readonly analysis: AnalysisVersion; readonly candidates: readonly AiCandidate[]; readonly errorCode: ProviderErrorCode }

export interface AiTaskRunner {
  runTask(command: RunAiTaskCommand): Promise<RunAiTaskResult>
  runQuickAnalysis(command: RunQuickAnalysisCommand): Promise<readonly RunAiTaskResult[]>
  cancel(caseId: UuidV4): void
  isRunning(caseId: UuidV4): boolean
}

export interface AiTaskRunnerDependencies {
  readonly aiRepository: AiRepository
  readonly caseRepository?: Pick<CaseRepository, 'listConfirmedFacts' | 'listTimeline'>
  readonly client: AiApiClient
  readonly now?: () => UtcTimestamp
  readonly idFactory?: () => UuidV4
  readonly releaseDerivedMedia?: (media: readonly DerivedMedia[]) => void
}

export class AiTaskRunnerError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode) {
    super(code)
    this.name = 'AiTaskRunnerError'
    this.code = code
  }
}

function defaultNow(): UtcTimestamp {
  return new Date().toISOString() as UtcTimestamp
}

function defaultIdFactory(): UuidV4 {
  return crypto.randomUUID() as UuidV4
}

function errorCode(error: unknown, signal: AbortSignal): ProviderErrorCode {
  if (signal.aborted || error instanceof AiApiClientError && error.code === 'request_cancelled') {
    return 'request_cancelled'
  }
  if (error instanceof AiApiClientError) return error.code
  if (error instanceof AiTaskRunnerError) return error.code
  return 'provider_unreachable'
}

function usageTotal(left: AiTaskResult['usage'], right: AiTaskResult['usage']): AiTaskResult['usage'] {
  if (left === null && right === null) return null
  return {
    inputTokens: (left?.inputTokens ?? 0) + (right?.inputTokens ?? 0),
    outputTokens: (left?.outputTokens ?? 0) + (right?.outputTokens ?? 0),
    totalTokens: (left?.totalTokens ?? 0) + (right?.totalTokens ?? 0),
  }
}

function batchManifest(manifest: InputManifest, items: InputManifest['items']): InputManifest {
  return {
    ...manifest,
    items,
    batchCount: 1,
    totalDerivedBytes: items.reduce((total, item) => total + item.byteSize, 0),
  }
}

function statementInput(facts: readonly ConfirmedFact[], timeline: readonly TimelineEntry[]): string {
  return JSON.stringify({
    confirmedFacts: facts.map((fact) => ({
      id: fact.id,
      factType: fact.factType,
      fieldName: fact.fieldName,
      value: fact.value,
      sourceRefs: fact.sourceRefs,
    })),
    confirmedTimeline: timeline.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      timePrecision: entry.timePrecision,
      summary: entry.summary,
      detail: entry.detail,
      sourceRefs: entry.sourceRefs,
    })),
  })
}

function analysisVersion(input: {
  readonly id: UuidV4
  readonly command: RunAiTaskCommand
  readonly manifestDigest: string
  readonly batchCount: number
  readonly startedAt: UtcTimestamp
}): AnalysisVersion {
  return {
    id: input.id,
    caseId: input.command.caseId,
    taskType: input.command.taskType,
    providerPreset: input.command.provider.providerPreset,
    protocol: input.command.provider.protocol,
    baseUrlFingerprint: input.command.manifest.baseUrlFingerprint,
    modelName: input.command.provider.modelName,
    promptVersion: PROMPT_VERSIONS[input.command.taskType],
    outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    inputManifestDigest: input.manifestDigest,
    inputItemCount: input.command.manifest.items.length,
    inputPageCount: input.command.manifest.items.length,
    inputDerivedBytes: input.command.manifest.totalDerivedBytes,
    batchCount: input.batchCount,
    completedBatchCount: 0,
    securityPolicyVersion: SECURITY_POLICY_VERSION,
    repairAttempted: false,
    providerRequestIdFingerprint: null,
    usage: null,
    startedAt: input.startedAt,
    completedAt: null,
    status: 'running',
    errorCode: null,
  }
}

export function createAiTaskRunner(dependencies: AiTaskRunnerDependencies): AiTaskRunner {
  const running = new Map<UuidV4, AbortController>()
  const now = dependencies.now ?? defaultNow
  const idFactory = dependencies.idFactory ?? defaultIdFactory
  const release = dependencies.releaseDerivedMedia ?? releaseDerivedMedia

  const runTask = async (command: RunAiTaskCommand): Promise<RunAiTaskResult> => {
    if (!command.consentGranted) {
      return { status: 'awaiting_consent', analysis: null, candidates: [] }
    }
    if (running.has(command.caseId)) {
      throw new AiTaskRunnerError('task_already_running')
    }

    const controller = new AbortController()
    running.set(command.caseId, controller)
    const startedAt = now()
    const analysisId = idFactory()
    const batches = splitManifestBatches(command.manifest)
    const manifestDigest = await sha256Hex([new TextEncoder().encode(JSON.stringify(command.manifest))])
    let version = analysisVersion({ id: analysisId, command, manifestDigest, batchCount: batches.length, startedAt })
    const candidates: AiCandidate[] = []
    let usage: AiTaskResult['usage'] = null
    let repairAttempted = false
    let providerRequestIdFingerprint: string | null = null
    try {
      await dependencies.aiRepository.createAnalysis(version)
      for (const batch of batches) {
        if (controller.signal.aborted) throw new AiApiClientError('request_cancelled')
        const localManifest = batchManifest(command.manifest, batch.items.map((item) =>
          command.manifest.items.find((candidate) => candidate.sourceToken === item.sourceToken)!,
        ))
        let inputText = command.inputText
        if (command.taskType === 'draft_statement' && dependencies.caseRepository !== undefined) {
          inputText = statementInput(
            await dependencies.caseRepository.listConfirmedFacts(command.caseId),
            await dependencies.caseRepository.listTimeline(command.caseId),
          )
        }
        const batchTokens = new Set(localManifest.items.map((item) => item.sourceToken))
        const request: AiTaskRequest = {
          requestId: idFactory(),
          providerPreset: command.provider.providerPreset,
          protocol: command.provider.protocol,
          ...(command.provider.baseUrl.length === 0 ? {} : { baseUrl: command.provider.baseUrl }),
          modelName: command.provider.modelName,
          apiKey: command.provider.apiKey,
          capabilities: command.provider.capabilities,
          manifest: localManifest,
          ...(inputText === undefined ? {} : { inputText }),
          images: command.derivedMedia.filter((media) => batchTokens.has(media.sourceToken)).map((media) => ({
            sourceToken: media.sourceToken,
            bytes: media.bytes,
          })),
        }
        const result = await dependencies.client.executeTask(request, controller.signal)
        usage = usageTotal(usage, result.usage)
        repairAttempted ||= result.repairAttempted
        providerRequestIdFingerprint = result.providerRequestIdFingerprint ?? providerRequestIdFingerprint
        candidates.push(...localizeTaskOutput({
          analysisVersionId: analysisId,
          caseId: command.caseId,
          taskType: command.taskType,
          manifest: localManifest,
          output: result.output,
          createdAt: now(),
          idFactory,
        }))
        version = { ...version, completedBatchCount: version.completedBatchCount + 1 }
      }
      if (controller.signal.aborted) throw new AiApiClientError('request_cancelled')
      version = {
        ...version,
        completedBatchCount: batches.length,
        repairAttempted,
        providerRequestIdFingerprint,
        usage,
        completedAt: now(),
        status: 'completed',
        errorCode: null,
      }
      await dependencies.aiRepository.publishCompletedAnalysis(version, candidates)
      return { status: 'completed', analysis: version, candidates }
    } catch (error) {
      const code = errorCode(error, controller.signal)
      version = {
        ...version,
        completedAt: now(),
        status: code === 'request_cancelled' ? 'cancelled' : 'failed',
        errorCode: code,
      }
      await dependencies.aiRepository.updateAnalysis(version).catch(() => undefined)
      const finalStatus: 'failed' | 'cancelled' = code === 'request_cancelled' ? 'cancelled' : 'failed'
      return { status: finalStatus, analysis: version, candidates: [], errorCode: code }
    } finally {
      running.delete(command.caseId)
      release(command.derivedMedia)
    }
  }

  return {
    runTask,
    async runQuickAnalysis(command) {
      if (!command.consentGranted) {
        return [{ status: 'awaiting_consent', analysis: null, candidates: [] }]
      }
      const results: RunAiTaskResult[] = []
      for (const taskType of ['classify_evidence', 'extract_facts', 'build_timeline'] as const) {
        const result = await runTask(await command.createTask(taskType))
        results.push(result)
        if (result.status !== 'completed') break
      }
      return results
    },
    cancel(caseId) {
      running.get(caseId)?.abort()
    },
    isRunning(caseId) {
      return running.has(caseId)
    },
  }
}
