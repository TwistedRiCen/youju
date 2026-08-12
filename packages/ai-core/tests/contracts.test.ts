import { describe, expect, it } from 'vitest'
import {
  ExtractFactsResultSchema,
  isBuildTimelineResult,
  isClassifyEvidenceResult,
  isDraftStatementRequest,
  isDraftStatementResult,
  isExtractFactsResult,
  isMissingMaterialResult,
} from '../src/index.js'

const sourceToken = '00000000-0000-4000-8000-000000000501'
const confirmedFactId = '00000000-0000-4000-8000-000000000011'
const confirmedTimelineEntryId = '00000000-0000-4000-8000-000000000040'

const validExtraction = {
  facts: [
    {
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '899.00',
      normalizedValue: '89900',
      confidenceLevel: 'high',
      sources: [
        {
          sourceToken,
          page: 1,
          region: { x: 112, y: 306, width: 358, height: 53 },
        },
      ],
    },
  ],
  uncertainties: [],
  warnings: [],
}

describe('AI structured output contracts', () => {
  it('accepts extracted facts with evidence, page, and region provenance', () => {
    expect(isExtractFactsResult(validExtraction)).toBe(true)
  })

  it('rejects extracted facts without source evidence', () => {
    expect(
      isExtractFactsResult({
        ...validExtraction,
        facts: [{ ...validExtraction.facts[0], sources: [] }],
      }),
    ).toBe(false)
  })

  it('requires non-negative integer source regions', () => {
    expect(
      isExtractFactsResult({
        ...validExtraction,
        facts: [
          {
            ...validExtraction.facts[0],
            sources: [
              {
                sourceToken,
                page: 1,
                region: { x: -1, y: 306, width: 358, height: 53 },
              },
            ],
          },
        ],
      }),
    ).toBe(false)
  })

  it('restricts AI confidence to the approved values', () => {
    for (const confidenceLevel of ['high', 'needs_confirmation', 'conflicted', 'unknown']) {
      expect(
        isExtractFactsResult({
          ...validExtraction,
          facts: [{ ...validExtraction.facts[0], confidenceLevel }],
        }),
      ).toBe(true)
    }

    expect(
      isExtractFactsResult({
        ...validExtraction,
        facts: [{ ...validExtraction.facts[0], confidenceLevel: 'auto_confirmed' }],
      }),
    ).toBe(false)
  })

  it('rejects mismatched fact types and field names', () => {
    expect(
      isExtractFactsResult({
        ...validExtraction,
        facts: [
          {
            ...validExtraction.facts[0],
            factType: 'order',
            fieldName: 'paid_amount',
          },
        ],
      }),
    ).toBe(false)
  })

  it('validates evidence classification outputs against domain categories', () => {
    const result = {
      classifications: [
        {
          sourceToken,
          category: 'payment_record',
          confidenceLevel: 'needs_confirmation',
        },
      ],
      warnings: [],
    }

    expect(isClassifyEvidenceResult(result)).toBe(true)
    expect(
      isClassifyEvidenceResult({
        ...result,
        classifications: [{ ...result.classifications[0], category: 'medical_record' }],
      }),
    ).toBe(false)
  })

  it('requires timeline candidates to remain source-linked', () => {
    const result = {
      entries: [
        {
          occurredAt: '2026-07-29T10:00:00.000Z',
          timePrecision: 'minute',
          summary: '用户完成付款',
          detail: null,
          confidenceLevel: 'high',
          sources: [{ sourceToken, page: 1 }],
        },
      ],
      uncertainties: [],
      warnings: [],
    }

    expect(isBuildTimelineResult(result)).toBe(true)
    expect(
      isBuildTimelineResult({
        ...result,
        entries: [{ ...result.entries[0], sources: [] }],
      }),
    ).toBe(false)
  })

  it('requires missing-material suggestions to cite their source evidence', () => {
    const result = {
      suggestions: [
        {
          category: 'merchant_communication',
          label: '商家沟通记录',
          reason: '当前材料未体现商家对退款请求的回复',
          sources: [{ sourceToken, page: 1 }],
        },
      ],
      warnings: [],
    }

    expect(isMissingMaterialResult(result)).toBe(true)
    expect(
      isMissingMaterialResult({
        ...result,
        suggestions: [{ ...result.suggestions[0], sources: [] }],
      }),
    ).toBe(false)
  })

  it('allows statement requests to reference confirmed facts only', () => {
    expect(
      isDraftStatementRequest({
        confirmedFactIds: [confirmedFactId],
        confirmedTimelineEntryIds: [confirmedTimelineEntryId],
      }),
    ).toBe(true)
    expect(
      isDraftStatementRequest({
        confirmedFactIds: [confirmedFactId],
        confirmedTimelineEntryIds: [confirmedTimelineEntryId],
        factCandidateIds: ['00000000-0000-4000-8000-000000000010'],
      }),
    ).toBe(false)
  })

  it('rejects statement drafts containing non-confirmed references or legal conclusions', () => {
    const result = {
      text: '用户已付款并请求退货退款。',
      confirmedFactIds: [confirmedFactId],
      confirmedTimelineEntryIds: [confirmedTimelineEntryId],
      warnings: [],
    }

    expect(isDraftStatementResult(result)).toBe(true)
    expect(
      isDraftStatementResult({
        ...result,
        factCandidateIds: ['00000000-0000-4000-8000-000000000010'],
      }),
    ).toBe(false)
    expect(isDraftStatementResult({ ...result, legalLiability: 'merchant_liable' })).toBe(false)
    expect(isDraftStatementResult({ ...result, compensationAmount: '179800' })).toBe(false)
    expect(isDraftStatementResult({ ...result, complaintSuccessRate: '90%' })).toBe(false)
  })

  it('rejects unknown fields throughout nested AI output objects', () => {
    expect(
      isExtractFactsResult({
        ...validExtraction,
        facts: [
          {
            ...validExtraction.facts[0],
            sources: [{ ...validExtraction.facts[0]?.sources[0], rawModelOutput: 'hidden' }],
          },
        ],
      }),
    ).toBe(false)
  })

  it('keeps a reviewable snapshot of the extraction JSON Schema', () => {
    expect(ExtractFactsResultSchema).toMatchSnapshot()
  })
})
