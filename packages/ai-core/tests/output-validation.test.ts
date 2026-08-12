import {
  localizeTaskOutput,
  type InputManifest,
  type AiCandidate,
  detectCandidateConflicts,
} from '../src/index.js'
import type { ConfirmedFact, TimelineEntry } from '@youju/domain'
import { describe, expect, it } from 'vitest'

const caseId = '00000000-0000-4000-8000-000000000001'
const analysisVersionId = '00000000-0000-4000-8000-000000000301'
const sourceToken = '00000000-0000-4000-8000-000000000501'
const secondSourceToken = '00000000-0000-4000-8000-000000000502'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const secondEvidenceId = '00000000-0000-4000-8000-000000000102'
const createdAt = '2026-08-12T03:00:00.000Z'

function manifest(overrides: Partial<InputManifest> = {}): InputManifest {
  return {
    taskId: '00000000-0000-4000-8000-000000000401',
    caseId,
    title: '本地事件标题',
    taskType: 'extract_facts',
    providerPreset: 'aliyun_bailian',
    protocol: 'chat_completions',
    baseUrlFingerprint: 'sha256:fixture',
    modelName: 'fixture-model',
    items: [
      {
        sourceToken,
        evidenceId,
        originalName: 'order.png',
        page: 1,
        derivedMediaType: 'image/webp',
        pixelWidth: 1600,
        pixelHeight: 2200,
        byteSize: 1024,
        derivedSha256: 'a'.repeat(64),
      },
    ],
    batchCount: 1,
    totalDerivedBytes: 1024,
    ...overrides,
  }
}

function idFactory() {
  let next = 601
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
}

function extractedFact(source = sourceToken) {
  return {
    factType: 'payment' as const,
    fieldName: 'paid_amount' as const,
    value: '899.00',
    normalizedValue: '89900',
    confidenceLevel: 'high' as const,
    sources: [{ sourceToken: source, page: 1, region: { x: 10, y: 20, width: 300, height: 40 } }],
  }
}

function localize(input: {
  readonly manifest?: InputManifest
  readonly output?: unknown
  readonly taskType?: 'classify_evidence' | 'extract_facts' | 'build_timeline' | 'draft_statement'
}) {
  return localizeTaskOutput({
    analysisVersionId,
    caseId,
    taskType: input.taskType ?? 'extract_facts',
    manifest: input.manifest ?? manifest(),
    output: input.output ?? { facts: [extractedFact()], uncertainties: [], warnings: [] },
    createdAt,
    idFactory: idFactory(),
  })
}

describe('AI output localization and validation', () => {
  it('localizes every source token to a stable evidence reference and keeps page geometry', () => {
    const [candidate] = localize({})

    expect(candidate).toMatchObject({
      candidateType: 'fact',
      caseId,
      analysisVersionId,
      reviewStatus: 'pending',
      sourceRefs: [{ evidenceId }],
      sourceLocations: [
        {
          evidenceId,
          page: 1,
          pixelWidth: 1600,
          pixelHeight: 2200,
          region: { x: 10, y: 20, width: 300, height: 40 },
        },
      ],
    })
    expect(candidate && 'sourceToken' in candidate).toBe(false)
  })

  it('rejects the whole stage when any source token is unknown', () => {
    expect(() =>
      localize({
        output: {
          facts: [
            extractedFact(),
            extractedFact('00000000-0000-4000-8000-000000000599'),
          ],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('unknown_source_token')
  })

  it('rejects duplicate manifest source tokens before producing candidates', () => {
    expect(() =>
      localize({
        manifest: manifest({
          items: [
            ...manifest().items,
            { ...manifest().items[0]!, page: 2, sourceToken: sourceToken },
          ],
          batchCount: 1,
          totalDerivedBytes: 2048,
        }),
      }),
    ).toThrow('duplicate_source_token')
  })

  it('rejects a source page that differs from the authorized page', () => {
    expect(() =>
      localize({
        output: {
          facts: [
            {
              ...extractedFact(),
              sources: [{ sourceToken, page: 2 }],
            },
          ],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('source_page_mismatch')
  })

  it('rejects zero or out-of-bounds source regions', () => {
    expect(() =>
      localize({
        output: {
          facts: [{ ...extractedFact(), sources: [{ sourceToken, page: 1, region: { x: 0, y: 0, width: 0, height: 1 } }] }],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('invalid_source_region')

    expect(() =>
      localize({
        output: {
          facts: [{ ...extractedFact(), sources: [{ sourceToken, page: 1, region: { x: 1500, y: 0, width: 200, height: 1 } }] }],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('invalid_source_region')
  })

  it('rejects absent sources and unknown nested fields through the strict wire schema', () => {
    expect(() =>
      localize({
        output: {
          facts: [{ ...extractedFact(), sources: [] }],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('invalid_structured_output')

    expect(() =>
      localize({
        output: {
          facts: [{ ...extractedFact(), rawModelOutput: 'do not persist' }],
          uncertainties: [],
          warnings: [],
        },
      }),
    ).toThrow('invalid_structured_output')
  })

  it('localizes classification, timeline and statement outputs without stable local IDs in wire data', () => {
    const classification = localize({
      taskType: 'classify_evidence',
      output: {
        classifications: [{ sourceToken, category: 'payment_record', confidenceLevel: 'high' }],
        warnings: [],
      },
    })
    expect(classification[0]).toMatchObject({
      candidateType: 'classification',
      evidenceId,
      sourceRefs: [{ evidenceId }],
    })

    const timeline = localize({
      taskType: 'build_timeline',
      output: {
        entries: [
          {
            occurredAt: '2026-07-01T12:16:00.000Z',
            timePrecision: 'minute',
            summary: '付款完成',
            detail: null,
            confidenceLevel: 'high',
            sources: [{ sourceToken, page: 1 }],
          },
        ],
        uncertainties: [],
        warnings: [],
      },
    })
    expect(timeline[0]).toMatchObject({
      candidateType: 'timeline',
      sourceRefs: [{ evidenceId }],
      sourceLocations: [{ evidenceId, page: 1 }],
    })

    const statement = localize({
      taskType: 'draft_statement',
      output: {
        text: '<script>not executable</script> https://example.test **plain text**',
        confirmedFactIds: ['00000000-0000-4000-8000-000000000011'],
        confirmedTimelineEntryIds: ['00000000-0000-4000-8000-000000000041'],
        warnings: [],
      },
    })
    expect(statement[0]).toMatchObject({
      candidateType: 'statement',
      text: '<script>not executable</script> https://example.test **plain text**',
      sourceRefs: [],
    })
  })

  it('detects duplicate normalized facts and mismatches with current formal records', () => {
    const candidates = localize({
      manifest: manifest({
        items: [
          ...manifest().items,
          {
            ...manifest().items[0]!,
            sourceToken: secondSourceToken,
            evidenceId: secondEvidenceId,
            page: 2,
          },
        ],
        batchCount: 1,
        totalDerivedBytes: 2048,
      }),
      output: {
        facts: [
          extractedFact(),
          {
            ...extractedFact(secondSourceToken),
            sources: [{ sourceToken: secondSourceToken, page: 2 }],
            normalizedValue: '90000',
            value: '900.00',
          },
        ],
        uncertainties: [],
        warnings: [],
      },
    })

    const conflicts = detectCandidateConflicts({
      candidates,
      currentFacts: [],
      currentTimeline: [],
    })
    expect(conflicts).toHaveLength(2)
    expect(conflicts.every(({ type }) => type === 'candidate_value_conflict')).toBe(true)

    const formalFact = {
      id: '00000000-0000-4000-8000-000000000201',
      caseId,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '899.00',
      sourceRefs: [{ evidenceId }],
      confirmedAt: '2026-08-12T02:00:00.000Z',
      confirmationMethod: 'manual',
      derivedFromCandidateId: null,
      replacesFactId: null,
      version: 1,
    } satisfies ConfirmedFact
    const formalConflicts = detectCandidateConflicts({
      candidates: [candidates[1] as AiCandidate],
      currentFacts: [formalFact],
      currentTimeline: [],
    })
    expect(formalConflicts).toMatchObject([
      { candidateId: candidates[1]?.id, type: 'formal_fact_conflict', conflictingRecordId: formalFact.id },
    ])
  })

  it('detects a timeline conflict with a current formal entry', () => {
    const timelineCandidate = localize({
      taskType: 'build_timeline',
      output: {
        entries: [{
          occurredAt: '2026-07-01T12:16:00.000Z',
          timePrecision: 'minute',
          summary: '付款完成',
          detail: null,
          confidenceLevel: 'high',
          sources: [{ sourceToken, page: 1 }],
        }],
        uncertainties: [],
        warnings: [],
      },
    })
    const formalTimeline = {
      id: '00000000-0000-4000-8000-000000000401',
      caseId,
      occurredAt: '2026-07-01T12:16:00.000Z',
      timePrecision: 'minute',
      summary: '付款未完成',
      detail: null,
      sourceRefs: [{ evidenceId }],
      contentOrigin: 'manual',
      derivedFromCandidateId: null,
      status: 'confirmed',
      sortOrder: 0,
    } satisfies TimelineEntry

    expect(detectCandidateConflicts({
      candidates: timelineCandidate,
      currentFacts: [],
      currentTimeline: [formalTimeline],
    })).toMatchObject([
      { candidateId: timelineCandidate[0]?.id, type: 'formal_timeline_conflict', conflictingRecordId: formalTimeline.id },
    ])
  })
})
