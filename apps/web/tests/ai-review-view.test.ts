import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { AiCandidate } from '@youju/ai-core'
import type { EvidenceFile } from '@youju/domain'
import type { AiReviewService } from '../src/services/ai-review-service.js'
import type { DerivedMedia } from '../src/ai/derived-media.js'

const { default: AiReviewView } = await import('../src/views/AiReviewView.vue')
const { default: SourceRegionPreview } = await import('../src/components/SourceRegionPreview.vue')

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const analysisId = '00000000-0000-4000-8000-000000000201'

const evidence: EvidenceFile = {
  id: evidenceId,
  caseId,
  originalName: 'fictional-order.png',
  mediaType: 'image/png',
  size: 16,
  sha256: 'a'.repeat(64),
  importedAt: '2026-08-12T01:00:00.000Z',
  sourceCreatedAt: null,
  category: 'order_record',
  categoryOrigin: 'manual',
  categoryCandidateId: null,
  storageRef: `cases/${caseId}/evidence/${evidenceId}`,
  isOriginalPreserved: true,
  metadata: {},
}

function factCandidate(id: string, reviewStatus: AiCandidate['reviewStatus'] = 'pending'): AiCandidate {
  return {
    id,
    caseId,
    analysisVersionId: analysisId,
    candidateType: 'fact',
    origin: 'ai',
    reviewStatus,
    createdAt: '2026-08-12T01:00:30.000Z',
    confidenceLevel: 'high',
    sourceRefs: [{ evidenceId }],
    sourceLocations: [{ evidenceId, page: 1, pixelWidth: 1200, pixelHeight: 1600, region: { x: 10, y: 20, width: 300, height: 40 } }],
    factType: 'payment',
    fieldName: 'paid_amount',
    value: '<a href="https://fictional.invalid">899.00</a>',
    normalizedValue: '89900',
  }
}

const statementCandidate: AiCandidate = {
  id: '00000000-0000-4000-8000-000000000302',
  caseId,
  analysisVersionId: analysisId,
  candidateType: 'statement',
  origin: 'ai',
  reviewStatus: 'conflicted',
  createdAt: '2026-08-12T01:00:30.000Z',
  confidenceLevel: 'conflicted',
  sourceRefs: [{ evidenceId }],
  sourceLocations: [{ evidenceId, page: 1, pixelWidth: 1200, pixelHeight: 1600 }],
  text: 'fictional statement',
  confirmedFactIds: [],
  confirmedTimelineEntryIds: [],
  conflictType: 'formal_fact_conflict',
}

function reviewService(overrides: Partial<AiReviewService> = {}): AiReviewService {
  return {
    confirm: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    confirmEligibleBatch: vi.fn(async () => undefined),
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AI candidate review view', () => {
  it('groups candidates, renders source provenance as inert text, and exposes review actions', async () => {
    const candidate = factCandidate('00000000-0000-4000-8000-000000000301')
    const service = reviewService()
    const wrapper = mount(AiReviewView, {
      props: {
        caseId,
        candidates: [candidate, statementCandidate],
        evidence: [evidence],
        analysisStatuses: { [analysisId]: 'completed' },
        reviewService: service,
      },
    })

    expect(wrapper.text()).toContain('AI 候选')
    expect(wrapper.text()).toContain('待确认')
    expect(wrapper.text()).toContain('冲突')
    expect(wrapper.text()).toContain('已处理')
    expect(wrapper.text()).toContain('fictional-order.png')
    expect(wrapper.text()).toContain('第 1 页')
    expect(wrapper.text()).toContain('<a href="https://fictional.invalid">899.00</a>')
    expect(wrapper.find('a[href="https://fictional.invalid"]').exists()).toBe(false)
    expect(wrapper.get(`[data-candidate-id="${candidate.id}"]`).find('[data-action="confirm"]').exists()).toBe(true)
    expect(wrapper.get(`[data-candidate-id="${statementCandidate.id}"]`).find('[data-action="edit-confirm"]').exists()).toBe(true)
    expect(wrapper.find(`[data-candidate-id="${statementCandidate.id}"] input[type="checkbox"]`).exists()).toBe(false)

    await wrapper.get(`[data-candidate-id="${candidate.id}"] [data-action="confirm"]`).trigger('click')
    expect(service.confirm).toHaveBeenCalledWith(expect.objectContaining({
      type: 'fact',
      candidateId: candidate.id,
    }))
    expect(wrapper.get(`[data-candidate-id="${candidate.id}"]`).text()).toContain('已处理')
  })

  it('supports edit-confirm, reject, eligible batch confirmation, and keeps failed batches pending', async () => {
    const editable = factCandidate('00000000-0000-4000-8000-000000000303')
    const rejected = factCandidate('00000000-0000-4000-8000-000000000304')
    const service = reviewService()
    const wrapper = mount(AiReviewView, {
      props: {
        caseId,
        candidates: [editable, rejected],
        evidence: [evidence],
        analysisStatuses: { [analysisId]: 'completed' },
        reviewService: service,
      },
    })

    const editableCard = wrapper.get(`[data-candidate-id="${editable.id}"]`)
    await editableCard.get('textarea').setValue('900.00')
    await editableCard.get('[data-action="edit-confirm"]').trigger('click')
    expect(service.confirm).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: editable.id,
      editedValue: '900.00',
    }))

    await wrapper.get(`[data-candidate-id="${rejected.id}"] [data-action="reject"]`).trigger('click')
    expect(service.reject).toHaveBeenCalledWith(rejected.id, expect.any(String))

    const batchCandidate = factCandidate('00000000-0000-4000-8000-000000000305')
    await wrapper.setProps({ candidates: [batchCandidate] })
    await wrapper.get(`[data-candidate-id="${batchCandidate.id}"] input[type="checkbox"]`).setValue(true)
    expect(wrapper.find('[data-action="batch-confirm"]').exists()).toBe(true)
    await wrapper.get('[data-action="batch-confirm"]').trigger('click')
    expect(service.confirmEligibleBatch).toHaveBeenCalledWith([batchCandidate.id], expect.any(String))

    const failingCandidate = factCandidate('00000000-0000-4000-8000-000000000306')
    const failingService = reviewService({
      confirmEligibleBatch: vi.fn(async () => { throw new Error('candidate_not_eligible') }),
    })
    await wrapper.setProps({ candidates: [failingCandidate], reviewService: failingService })
    await wrapper.get(`[data-candidate-id="${failingCandidate.id}"] input[type="checkbox"]`).setValue(true)
    await wrapper.get('[data-action="batch-confirm"]').trigger('click')
    expect(wrapper.get(`[data-candidate-id="${failingCandidate.id}"]`).text()).toContain('待确认')
  })

  it('requires the existing final statement confirmation after a statement candidate is confirmed', async () => {
    const candidate: AiCandidate = {
      ...statementCandidate,
      id: '00000000-0000-4000-8000-000000000306',
      reviewStatus: 'pending',
      confidenceLevel: 'high',
    }
    const service = reviewService()
    const wrapper = mount(AiReviewView, {
      props: { caseId, candidates: [candidate], evidence: [evidence], reviewService: service },
    })
    await wrapper.get(`[data-candidate-id="${candidate.id}"] [data-action="confirm"]`).trigger('click')
    expect(wrapper.text()).toContain('请前往陈述页面执行最终“确认陈述”')
    expect(wrapper.find(`a[href="/cases/${caseId}/statement"]`).exists()).toBe(true)
  })
})

describe('source region preview', () => {
  it('reads the original through the blob store, derives in memory, and bounds the region overlay', async () => {
    const derived: DerivedMedia = {
      sourceToken: '00000000-0000-4000-8000-000000000401',
      evidenceId,
      page: 1,
      mediaType: 'image/webp',
      width: 1200,
      height: 1600,
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'b'.repeat(64),
      previewUrl: 'blob:fictional-preview',
    }
    const blobStore = { read: vi.fn(async () => new Blob(['fictional-original'])) }
    const derivePage = vi.fn(async () => derived)
    const wrapper = mount(SourceRegionPreview, {
      props: {
        evidenceId,
        storageRef: evidence.storageRef,
        mediaType: evidence.mediaType,
        page: 1,
        pixelWidth: 1200,
        pixelHeight: 1600,
        region: { x: 10, y: 20, width: 300, height: 40 },
        blobStore,
        derivePage,
      },
    })

    await flushPromises()
    expect(blobStore.read).toHaveBeenCalledWith(evidence.storageRef)
    expect(derivePage).toHaveBeenCalledWith(expect.objectContaining({ evidenceId, page: 1 }))
    expect(wrapper.find('img').attributes('src')).toBe(derived.previewUrl)
    expect(wrapper.find('[data-testid="source-region"]').attributes('style')).toContain('left: 0.833333%')
    expect(wrapper.find('[data-testid="source-region"]').attributes('style')).toContain('top: 1.25%')
  })
})
