import { describe, expect, it } from 'vitest'
import type { AiCandidate } from '@youju/ai-core'
import { createAiReviewService } from '../src/services/ai-review-service.js'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const analysisId = '00000000-0000-4000-8000-000000000201'

const analysis = {
  id: analysisId,
  caseId,
  taskType: 'extract_facts',
  providerPreset: 'openai',
  protocol: 'responses',
  baseUrlFingerprint: 'sha256:provider.example',
  modelName: 'example-model',
  promptVersion: 'm3-prompt-v1',
  outputSchemaVersion: 1,
  inputManifestDigest: 'a'.repeat(64),
  inputItemCount: 1,
  inputPageCount: 1,
  inputDerivedBytes: 1024,
  batchCount: 1,
  completedBatchCount: 1,
  securityPolicyVersion: 'm3-security-v1',
  repairAttempted: false,
  providerRequestIdFingerprint: null,
  usage: null,
  startedAt: '2026-08-12T01:00:00.000Z',
  completedAt: '2026-08-12T01:01:00.000Z',
  status: 'completed',
  errorCode: null,
}

function factCandidate(id: string, confidenceLevel: 'high' | 'needs_confirmation' = 'high'): AiCandidate {
  return {
    id,
    caseId,
    analysisVersionId: analysisId,
    candidateType: 'fact',
    origin: 'ai',
    reviewStatus: 'pending',
    createdAt: '2026-08-12T01:00:30.000Z',
    confidenceLevel,
    sourceRefs: [{ evidenceId }],
    sourceLocations: [{ evidenceId, page: 1, pixelWidth: 1200, pixelHeight: 1600 }],
    factType: 'payment',
    fieldName: 'paid_amount',
    value: '899.00',
    normalizedValue: '89900',
  }
}

class FakeAiRepository {
  readonly candidates = new Map<string, AiCandidate>()
  readonly analyses = new Map([[analysisId, analysis]])
  readonly confirmationCalls: unknown[] = []
  readonly batchCalls: unknown[] = []

  async getCandidate(id: string): Promise<AiCandidate | null> {
    return this.candidates.get(id) ?? null
  }

  async putCandidate(candidate: AiCandidate): Promise<void> {
    this.candidates.set(candidate.id, candidate)
  }

  async getAnalysis(id: string): Promise<typeof analysis | null> {
    return this.analyses.get(id) ?? null
  }

  async confirmCandidate(command: unknown, ruleVersion: string): Promise<void> {
    this.confirmationCalls.push({ command, ruleVersion })
  }

  async confirmCandidates(commands: readonly unknown[], ruleVersion: string): Promise<void> {
    this.batchCalls.push({ commands, ruleVersion })
  }
}

class FakeCaseRepository {
  async listEvidence(): Promise<readonly { readonly id: string }[]> {
    return [{ id: evidenceId }]
  }
}

function createService(aiRepository: FakeAiRepository) {
  return createAiReviewService({
    aiRepository: aiRepository as never,
    caseRepository: new FakeCaseRepository() as never,
    ruleVersion: 'm3-rule-v1',
  })
}

describe('AI review service', () => {
  it('rejects a candidate without changing formal records', async () => {
    const repository = new FakeAiRepository()
    const candidate = factCandidate('00000000-0000-4000-8000-000000000301')
    repository.candidates.set(candidate.id, candidate)
    const service = createService(repository)

    await service.reject(candidate.id, '2026-08-12T02:00:00.000Z')

    expect(repository.confirmationCalls).toEqual([])
    expect(repository.batchCalls).toEqual([])
    expect(repository.candidates.get(candidate.id)).toMatchObject({ reviewStatus: 'rejected' })
  })

  it('passes an edited fact confirmation only after explicit confirmation', async () => {
    const repository = new FakeAiRepository()
    const candidate = factCandidate('00000000-0000-4000-8000-000000000302')
    repository.candidates.set(candidate.id, candidate)
    const service = createService(repository)

    await service.confirm({
      type: 'fact',
      candidateId: candidate.id,
      editedValue: '90100',
      confirmedFactId: '00000000-0000-4000-8000-000000000501',
      replacesFactId: null,
      reviewedAt: '2026-08-12T02:01:00.000Z',
    })

    expect(repository.confirmationCalls).toEqual([
      {
        command: {
          type: 'fact',
          candidateId: candidate.id,
          editedValue: '90100',
          confirmedFactId: '00000000-0000-4000-8000-000000000501',
          replacesFactId: null,
          reviewedAt: '2026-08-12T02:01:00.000Z',
        },
        ruleVersion: 'm3-rule-v1',
      },
    ])
  })

  it('validates the complete batch before opening a confirmation transaction', async () => {
    const repository = new FakeAiRepository()
    const eligible = factCandidate('00000000-0000-4000-8000-000000000303')
    const ineligible = factCandidate('00000000-0000-4000-8000-000000000304', 'needs_confirmation')
    repository.candidates.set(eligible.id, eligible)
    repository.candidates.set(ineligible.id, ineligible)
    const service = createService(repository)

    await expect(
      service.confirmEligibleBatch(
        [eligible.id, ineligible.id],
        '2026-08-12T02:02:00.000Z',
      ),
    ).rejects.toThrow('candidate_not_eligible')

    expect(repository.batchCalls).toEqual([])
  })
})
