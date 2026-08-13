<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import type {
  ConfirmedFact,
  EvidenceFile,
  FactDraft,
  FactFieldName,
  SourceReference,
  UuidV4,
} from '@youju/domain'
import { selectCurrentConfirmedFacts } from '@youju/domain'
import FactEditor from '../components/FactEditor.vue'
import { createAutosave } from '../composables/use-autosave.js'
import type { AutosaveController } from '../composables/use-autosave.js'
import { fenToYuan, toUtcTimestamp, yuanToFen } from '../services/case-service.js'
import {
  confirmFactDraft,
  loadFacts,
  saveFactDrafts,
} from '../services/fact-service.js'
import { listCaseEvidence } from '../services/evidence-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

interface RequiredFactRow {
  readonly fieldName: FactFieldName
  readonly label: string
  readonly inputType: 'text' | 'datetime-local'
  readonly inputMode: 'decimal' | 'text'
}

const REQUIRED_FACTS: readonly RequiredFactRow[] = [
  {
    fieldName: 'purchase_time',
    label: '购买时间',
    inputType: 'datetime-local',
    inputMode: 'text',
  },
  { fieldName: 'merchant_name', label: '商家名称', inputType: 'text', inputMode: 'text' },
  { fieldName: 'product_name', label: '商品名称', inputType: 'text', inputMode: 'text' },
  {
    fieldName: 'paid_amount',
    label: '实付金额（元）',
    inputType: 'text',
    inputMode: 'decimal',
  },
  { fieldName: 'problem_description', label: '问题描述', inputType: 'text', inputMode: 'text' },
  {
    fieldName: 'requested_resolution',
    label: '期望处理结果',
    inputType: 'text',
    inputMode: 'text',
  },
]

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const drafts = shallowRef<readonly FactDraft[]>([])
const draftsByField = reactive<Record<string, FactDraft | undefined>>({})
const createdDraftIds = reactive<Record<string, string>>({})
const values = reactive<Record<string, string>>({})
const currentFacts = ref<readonly ConfirmedFact[]>([])
const evidence = shallowRef<readonly EvidenceFile[]>([])
const selectedSourceIdsByField = reactive<Record<string, string[]>>({})

let expectedRevision = 0
let autosave: AutosaveController<readonly FactDraft[]> | null = null

function toDisplayValue(draft: FactDraft): string {
  if (draft.fieldName === 'paid_amount') {
    return fenToYuan(draft.value)
  }
  if (draft.fieldName === 'purchase_time') {
    return draft.value.slice(0, 16)
  }
  return draft.value
}

function toPersistedValue(fieldName: FactFieldName, raw: string): string | null {
  if (fieldName === 'paid_amount') {
    return yuanToFen(raw)
  }
  if (fieldName === 'purchase_time') {
    return toUtcTimestamp(raw)
  }
  return raw
}

function sourceRefsFor(fieldName: FactFieldName): SourceReference[] {
  return (selectedSourceIdsByField[fieldName] ?? []).map((evidenceId) => ({ evidenceId }))
}

function createDraft(
  row: RequiredFactRow,
  value: string,
  now: string,
  sourceRefs: readonly SourceReference[],
): FactDraft {
  const base = {
    id: crypto.randomUUID(),
    caseId,
    value,
    sourceRefs: [...sourceRefs],
    updatedAt: now,
    revision: 1,
  }
  switch (row.fieldName) {
    case 'purchase_time':
      return { ...base, factType: 'order', fieldName: 'purchase_time' }
    case 'merchant_name':
      return { ...base, factType: 'merchant', fieldName: 'merchant_name' }
    case 'product_name':
      return { ...base, factType: 'product', fieldName: 'product_name' }
    case 'paid_amount':
      return { ...base, factType: 'payment', fieldName: 'paid_amount' }
    case 'problem_description':
      return { ...base, factType: 'issue', fieldName: 'problem_description' }
    case 'requested_resolution':
      return { ...base, factType: 'resolution', fieldName: 'requested_resolution' }
    default:
      throw new Error('unsupported_fact_field')
  }
}

function toPlainDraft(
  draft: FactDraft,
  value: string,
  now: string,
  sourceRefs: readonly SourceReference[],
): FactDraft {
  const base = {
    id: draft.id,
    caseId: draft.caseId,
    value,
    sourceRefs: sourceRefs.map((source) => ({ evidenceId: source.evidenceId })),
    updatedAt: now,
    revision: draft.revision,
  }
  switch (draft.factType) {
    case 'payment':
      return { ...base, factType: 'payment', fieldName: 'paid_amount' }
    case 'order':
      return { ...base, factType: 'order', fieldName: draft.fieldName }
    case 'merchant':
      return { ...base, factType: 'merchant', fieldName: 'merchant_name' }
    case 'product':
      return { ...base, factType: 'product', fieldName: 'product_name' }
    case 'delivery':
      return { ...base, factType: 'delivery', fieldName: 'received_time' }
    case 'issue':
      return { ...base, factType: 'issue', fieldName: 'problem_description' }
    case 'communication':
      return { ...base, factType: 'communication', fieldName: 'merchant_response' }
    case 'resolution':
      return { ...base, factType: 'resolution', fieldName: 'requested_resolution' }
  }
}

function buildDraftsForSave(): readonly FactDraft[] | null {
  const now = new Date().toISOString()
  const savedDrafts: FactDraft[] = []
  for (const row of REQUIRED_FACTS) {
    const raw = values[row.fieldName] ?? ''
    if (raw === '') {
      continue
    }
    const value = toPersistedValue(row.fieldName, raw)
    if (value === null) {
      return null
    }
    const existing = draftsByField[row.fieldName]
    const sourceRefs = sourceRefsFor(row.fieldName)
    if (existing !== undefined) {
      savedDrafts.push(toPlainDraft(existing, value, now, sourceRefs))
    } else {
      const created = createDraft(row, value, now, sourceRefs)
      createdDraftIds[row.fieldName] = created.id
      savedDrafts.push(created)
    }
  }
  return savedDrafts
}

function onValueChange(fieldName: FactFieldName, value: string): void {
  values[fieldName] = value
  if (autosave === null) {
    return
  }
  const saved = buildDraftsForSave()
  if (saved !== null) {
    autosave.schedule(saved)
  }
}

function draftIdFor(fieldName: FactFieldName): string | null {
  return draftsByField[fieldName]?.id ?? createdDraftIds[fieldName] ?? null
}

function applySnapshot(snapshot: Awaited<ReturnType<typeof loadFacts>>): void {
  drafts.value = snapshot.drafts
  for (const draft of snapshot.drafts) {
    draftsByField[draft.fieldName] = draft
  }
  expectedRevision = snapshot.revision
  currentFacts.value = selectCurrentConfirmedFacts(snapshot.currentFacts)
  for (const row of REQUIRED_FACTS) {
    const current = currentFacts.value.find((fact) => fact.fieldName === row.fieldName)
    const draft = draftsByField[row.fieldName]
    const sourceRefs = current?.sourceRefs ?? draft?.sourceRefs ?? []
    selectedSourceIdsByField[row.fieldName] = sourceRefs.map((source) => source.evidenceId)
  }
}

async function refreshSnapshot(): Promise<void> {
  const snapshot = await loadFacts(caseId)
  applySnapshot(snapshot)
}

function onSourceIdsChange(fieldName: FactFieldName, sourceIds: readonly string[]): void {
  selectedSourceIdsByField[fieldName] = [...sourceIds]
  if (autosave === null) {
    return
  }
  const saved = buildDraftsForSave()
  if (saved !== null) {
    autosave.schedule(saved)
  }
}

async function confirmRow(row: RequiredFactRow): Promise<void> {
  const raw = values[row.fieldName] ?? ''
  if (raw === '' || autosave === null) {
    return
  }
  await autosave.flush()
  const draftId = draftIdFor(row.fieldName)
  if (draftId === null) {
    return
  }
  const current = currentFacts.value.find((fact) => fact.fieldName === row.fieldName)
  await confirmFactDraft({
    draftId,
    confirmedFactId: crypto.randomUUID(),
    confirmedAt: new Date().toISOString(),
    sourceRefs: sourceRefsFor(row.fieldName),
    replacesFactId: current?.id ?? null,
  })
  await refreshSnapshot()
}

onMounted(async () => {
  try {
    const [snapshot, caseEvidence] = await Promise.all([
      loadFacts(caseId),
      listCaseEvidence(caseId),
    ])
    applySnapshot(snapshot)
    evidence.value = caseEvidence
    for (const row of REQUIRED_FACTS) {
      const draft = draftsByField[row.fieldName]
      values[row.fieldName] = draft === undefined ? '' : toDisplayValue(draft)
    }
    autosave = createAutosave({
      persist: async (saved) => {
        expectedRevision = await saveFactDrafts(caseId, expectedRevision, saved)
      },
    })
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="facts-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>事实确认</h1>
    <p class="hint">事实需要逐项确认后才能进入正式输出；来源关联可在导出前补充。</p>
    <p v-if="loading">正在加载事实…</p>
    <template v-else>
      <FactEditor
        v-for="row in REQUIRED_FACTS"
        :key="row.fieldName"
        :field-name="row.fieldName"
        :label="row.label"
        :value="values[row.fieldName] ?? ''"
        :input-type="row.inputType"
        :input-mode="row.inputMode"
        :disabled="!canWrite"
        :evidence="evidence"
        :selected-source-ids="selectedSourceIdsByField[row.fieldName] ?? []"
        @update-value="onValueChange(row.fieldName, $event)"
        @update-source-ids="onSourceIdsChange(row.fieldName, $event)"
        @confirm="confirmRow(row)"
      />
      <section class="confirmed" aria-label="当前正式事实">
        <h2>当前正式事实</h2>
        <ul>
          <li v-for="fact in currentFacts" :key="fact.id">
            {{ fact.fieldName }}：{{ fact.value }}（版本 {{ fact.version }}）
            <span v-if="fact.confirmationMethod !== 'manual'" class="provenance-badge">
              AI 候选已确认
            </span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.facts-shell {
  width: min(100%, 42rem);
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

.hint {
  color: #7a5a32;
  line-height: 1.6;
}

.confirmed {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
}

.confirmed ul {
  padding-left: 1.25rem;
  color: #31564c;
  line-height: 1.8;
}

.provenance-badge {
  margin-left: 0.4rem;
  color: #7a5a32;
  font-size: 0.85rem;
}
</style>
