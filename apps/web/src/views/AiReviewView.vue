<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { canBatchConfirm, type AiCandidate, type CandidateConflict } from '@youju/ai-core'
import type {
  AnalysisStatus,
  AnalysisVersion,
  EvidenceFile,
  EvidenceCategory,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import AiCandidateCard from '../components/AiCandidateCard.vue'
import SourceRegionPreview from '../components/SourceRegionPreview.vue'
import { createAiReviewService } from '../services/ai-review-service.js'
import type { AiReviewService } from '../services/ai-review-service.js'
import { getCaseRepository } from '../services/case-service.js'
import { getEvidenceBlobStore, listCaseEvidence } from '../services/evidence-service.js'
import { loadEcommerceRefundRule } from '../services/load-ecommerce-rule.js'
import {
  DATABASE_MIGRATIONS,
  IndexedDbAiRepository,
  openYoujuDatabase,
} from '../storage/index.js'

const props = defineProps<{
  readonly caseId: UuidV4
  readonly candidates?: readonly AiCandidate[]
  readonly evidence?: readonly EvidenceFile[]
  readonly analyses?: readonly AnalysisVersion[]
  readonly analysisStatuses?: Readonly<Record<string, AnalysisStatus>>
  readonly reviewService?: AiReviewService
  readonly blobStore?: Pick<EvidenceBlobStore, 'read'>
  readonly now?: () => string
}>()

const candidateList = ref<readonly AiCandidate[]>(props.candidates ?? [])
const evidenceList = ref<readonly EvidenceFile[]>(props.evidence ?? [])
const statusByAnalysis = ref<Record<string, AnalysisStatus>>({ ...(props.analysisStatuses ?? {}) })
const reviewService = shallowRef<AiReviewService | null>(props.reviewService ?? null)
const selectedIds = ref<UuidV4[]>([])
const busy = ref(false)
const loading = ref(props.candidates === undefined)
const errorMessage = ref('')
const statementConfirmationMessage = ref(false)
const previewStore = props.blobStore ?? getEvidenceBlobStore()
const REVIEW_ERROR_CODES = new Set(['candidate_not_eligible', 'invalid_ai_record', 'storage_unavailable'])

watch(() => props.candidates, (candidates) => {
  if (candidates !== undefined) {
    candidateList.value = [...candidates]
    selectedIds.value = []
  }
})
watch(() => props.reviewService, (service) => {
  if (service !== undefined) reviewService.value = service
})

const pendingCandidates = computed(() => candidateList.value.filter((candidate) => candidate.reviewStatus === 'pending'))
const conflictCandidates = computed(() => candidateList.value.filter((candidate) => candidate.reviewStatus === 'conflicted'))
const processedCandidates = computed(() => candidateList.value.filter((candidate) => (
  candidate.reviewStatus === 'confirmed' ||
  candidate.reviewStatus === 'edited_and_confirmed' ||
  candidate.reviewStatus === 'rejected'
)))
const selectedCandidates = computed(() => selectedIds.value
  .map((id) => candidateList.value.find((candidate) => candidate.id === id))
  .filter((candidate): candidate is AiCandidate => candidate !== undefined))
const canConfirmBatch = computed(() => (
  selectedCandidates.value.length > 0 && selectedCandidates.value.every((candidate) => canConfirm(candidate))
))

function timestamp(): UtcTimestamp {
  return (props.now ?? (() => new Date().toISOString()))() as UtcTimestamp
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return REVIEW_ERROR_CODES.has(message) ? message : 'storage_unavailable'
}

function evidenceFor(candidate: AiCandidate): EvidenceFile | undefined {
  const evidenceId = candidate.sourceRefs[0]?.evidenceId
  return evidenceList.value.find((item) => item.id === evidenceId)
}

function originalNameFor(candidate: AiCandidate): string {
  return evidenceFor(candidate)?.originalName ?? '来源材料未找到'
}

function previewProps(location: AiCandidate['sourceLocations'][number]): {
  readonly evidenceId: UuidV4
  readonly storageRef: string
  readonly mediaType: EvidenceFile['mediaType']
  readonly page: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly region?: NonNullable<typeof location.region>
  readonly blobStore: Pick<EvidenceBlobStore, 'read'>
} {
  const source = evidenceList.value.find((item) => item.id === location.evidenceId)
  const base = {
    evidenceId: location.evidenceId,
    storageRef: source?.storageRef ?? '',
    mediaType: source?.mediaType ?? 'image/png' as const,
    page: location.page,
    pixelWidth: location.pixelWidth,
    pixelHeight: location.pixelHeight,
    blobStore: previewStore,
  }
  return location.region === undefined ? base : { ...base, region: location.region }
}

function canConfirm(candidate: AiCandidate): boolean {
  if (candidate.candidateType === 'statement') return false
  const analysisStatus = statusByAnalysis.value[candidate.analysisVersionId]
  if (analysisStatus === undefined) return false
  const materialsReady = candidate.sourceRefs.every((source) =>
    evidenceList.value.some((item) => item.id === source.evidenceId),
  )
  const conflicts: CandidateConflict[] = candidate.conflictType === undefined
    ? []
    : [{ candidateId: candidate.id, type: candidate.conflictType }]
  return canBatchConfirm(candidate, {
    analysisStatus,
    authorizedSources: candidate.sourceLocations,
    conflicts,
    materialsReady,
    schemaValid: true,
  })
}

function toggleSelected(candidateId: UuidV4, selected: boolean): void {
  selectedIds.value = selected
    ? [...new Set([...selectedIds.value, candidateId])]
    : selectedIds.value.filter((id) => id !== candidateId)
}

function buildCommand(
  candidate: AiCandidate,
  editedValue: string | undefined,
): Parameters<AiReviewService['confirm']>[0] {
  const reviewedAt = timestamp()
  switch (candidate.candidateType) {
    case 'classification':
      return {
        type: 'classification',
        candidateId: candidate.id,
        ...(editedValue !== undefined && editedValue !== candidate.category
          ? { editedCategory: editedValue as EvidenceCategory }
          : {}),
        reviewedAt,
      }
    case 'fact':
      return {
        type: 'fact',
        candidateId: candidate.id,
        ...(editedValue !== undefined && editedValue !== candidate.value ? { editedValue } : {}),
        confirmedFactId: crypto.randomUUID() as UuidV4,
        replacesFactId: null,
        reviewedAt,
      }
    case 'timeline':
      return {
        type: 'timeline',
        candidateId: candidate.id,
        ...(editedValue !== undefined && editedValue !== candidate.summary
          ? { edited: { summary: editedValue } }
          : {}),
        timelineEntryId: crypto.randomUUID() as UuidV4,
        reviewedAt,
      }
    case 'statement':
      return {
        type: 'statement',
        candidateId: candidate.id,
        ...(editedValue !== undefined && editedValue !== candidate.text ? { editedText: editedValue } : {}),
        statementDraftId: crypto.randomUUID() as UuidV4,
        reviewedAt,
      }
  }
}

function setReviewStatus(candidateId: UuidV4, reviewStatus: AiCandidate['reviewStatus']): void {
  candidateList.value = candidateList.value.map((candidate) => (
    candidate.id === candidateId ? { ...candidate, reviewStatus } : candidate
  ))
  toggleSelected(candidateId, false)
}

async function confirm(candidate: AiCandidate, editedValue?: string): Promise<void> {
  if (reviewService.value === null) {
    errorMessage.value = 'storage_unavailable'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await reviewService.value.confirm(buildCommand(candidate, editedValue))
    setReviewStatus(candidate.id, editedValue === undefined ? 'confirmed' : 'edited_and_confirmed')
    if (candidate.candidateType === 'statement') {
      statementConfirmationMessage.value = true
    }
  } catch (error) {
    errorMessage.value = errorCode(error)
  } finally {
    busy.value = false
  }
}

async function reject(candidate: AiCandidate): Promise<void> {
  if (reviewService.value === null) {
    errorMessage.value = 'storage_unavailable'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await reviewService.value.reject(candidate.id, timestamp())
    setReviewStatus(candidate.id, 'rejected')
  } catch (error) {
    errorMessage.value = errorCode(error)
  } finally {
    busy.value = false
  }
}

async function confirmBatch(): Promise<void> {
  if (reviewService.value === null || !canConfirmBatch.value) return
  const ids = selectedIds.value
  busy.value = true
  errorMessage.value = ''
  try {
    await reviewService.value.confirmEligibleBatch(ids, timestamp())
    for (const id of ids) setReviewStatus(id, 'confirmed')
  } catch (error) {
    errorMessage.value = errorCode(error)
  } finally {
    busy.value = false
  }
}

async function loadDefaultState(): Promise<void> {
  const [database, caseRepository] = await Promise.all([
    openYoujuDatabase(DATABASE_MIGRATIONS),
    getCaseRepository(),
  ])
  const aiRepository = new IndexedDbAiRepository(database)
  if (props.candidates === undefined) {
    candidateList.value = await aiRepository.listCandidates(props.caseId)
  }
  if (props.evidence === undefined) {
    evidenceList.value = await caseRepository.listEvidence(props.caseId)
  }
  if (props.analyses === undefined && props.analysisStatuses === undefined) {
    const analyses = await aiRepository.listAnalyses(props.caseId)
    statusByAnalysis.value = Object.fromEntries(analyses.map((analysis) => [analysis.id, analysis.status]))
  }
  if (reviewService.value === null) {
    reviewService.value = createAiReviewService({
      aiRepository,
      caseRepository,
      ruleVersion: loadEcommerceRefundRule().version,
    })
  }
}

onMounted(async () => {
  try {
    if (props.analyses !== undefined) {
      statusByAnalysis.value = Object.fromEntries(props.analyses.map((analysis) => [analysis.id, analysis.status]))
    }
    if (props.candidates === undefined || props.evidence === undefined || reviewService.value === null) {
      await loadDefaultState()
    }
    if (props.evidence === undefined && evidenceList.value.length === 0) {
      evidenceList.value = await listCaseEvidence(props.caseId)
    }
  } catch (error) {
    errorMessage.value = errorCode(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="ai-review-shell">
    <a class="back" :href="`/cases/${caseId}/ai`">返回 AI 助手</a>
    <h1>AI 候选审核</h1>
    <p>以下内容均为 AI 候选，不是正式事实。确认、编辑后确认或拒绝前请核对来源。</p>
    <p v-if="loading">正在加载 AI 候选…</p>
    <p v-if="errorMessage" role="alert">操作失败：{{ errorMessage }}</p>
    <p v-if="statementConfirmationMessage" class="statement-notice">
      请前往陈述页面执行最终“确认陈述”。
      <a :href="`/cases/${caseId}/statement`">打开陈述页面</a>
    </p>

    <section aria-labelledby="pending-title">
      <h2 id="pending-title">待确认</h2>
      <p v-if="pendingCandidates.length === 0">暂无待确认候选。</p>
      <div v-for="candidate in pendingCandidates" :key="candidate.id" class="candidate-with-preview">
        <AiCandidateCard
          :candidate="candidate"
          :original-name="originalNameFor(candidate)"
          :batch-eligible="canConfirm(candidate)"
          :selected="selectedIds.includes(candidate.id)"
          :disabled="busy"
          @select="toggleSelected(candidate.id, $event)"
          @confirm="confirm(candidate)"
          @edit-confirm="confirm(candidate, $event)"
          @reject="reject(candidate)"
        />
        <template v-for="location in candidate.sourceLocations" :key="`${candidate.id}-${location.evidenceId}-${location.page}`">
          <SourceRegionPreview
            v-if="evidenceList.some((item) => item.id === location.evidenceId)"
            v-bind="previewProps(location)"
          />
        </template>
      </div>
    </section>

    <button
      v-if="selectedIds.length > 0"
      type="button"
      data-action="batch-confirm"
      :disabled="busy || !canConfirmBatch"
      @click="confirmBatch"
    >
      批量确认已选候选
    </button>

    <section aria-labelledby="conflict-title">
      <h2 id="conflict-title">冲突</h2>
      <p v-if="conflictCandidates.length === 0">暂无冲突候选。</p>
      <AiCandidateCard
        v-for="candidate in conflictCandidates"
        :key="candidate.id"
        :candidate="candidate"
        :original-name="originalNameFor(candidate)"
        :disabled="busy"
        @edit-confirm="confirm(candidate, $event)"
        @reject="reject(candidate)"
      />
    </section>

    <section aria-labelledby="processed-title">
      <h2 id="processed-title">已处理</h2>
      <p v-if="processedCandidates.length === 0">暂无已处理候选。</p>
      <AiCandidateCard
        v-for="candidate in processedCandidates"
        :key="candidate.id"
        :candidate="candidate"
        :original-name="originalNameFor(candidate)"
        :disabled="true"
      />
    </section>
  </main>
</template>

<style scoped>
.ai-review-shell {
  width: min(100%, 48rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.back {
  color: #527067;
}

h1,
h2 {
  color: #173f35;
}

section {
  margin-top: 1.5rem;
}

.candidate-with-preview {
  display: grid;
  gap: 0.75rem;
  margin: 0 0 1rem;
}

.statement-notice {
  padding: 0.75rem 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.6rem;
  background: #fffdf8;
}

button {
  padding: 0.55rem 0.85rem;
  border: 0;
  border-radius: 0.45rem;
  background: #173f35;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
