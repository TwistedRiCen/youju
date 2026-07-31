<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import type { FactDraft, UuidV4 } from '@youju/domain'
import { detectBrowserCapabilities } from '../browser/browser-capabilities.js'
import type { BrowserCapabilities } from '../browser/browser-capabilities.js'
import { createAutosave } from '../composables/use-autosave.js'
import type { AutosaveController } from '../composables/use-autosave.js'
import { useCaseWriteLock } from '../composables/use-case-write-lock.js'
import {
  fenToYuan,
  getCaseRepository,
  loadCase,
  saveCaseDrafts,
  toUtcTimestamp,
  yuanToFen,
} from '../services/case-service.js'
import type { CaseRepository } from '../storage/index.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4

const capabilities: BrowserCapabilities = detectBrowserCapabilities()
const { mode: writeMode, acquire, release } = useCaseWriteLock()

const loading = ref(true)
const notFound = ref(false)
const loadError = ref('')
const caseTitle = ref('')
const drafts = shallowRef<readonly FactDraft[]>([])
const values = reactive<Record<string, string>>({})

let autosave: AutosaveController<readonly FactDraft[]> | null = null
let repository: CaseRepository | null = null
let expectedRevision = 0

const fieldLabels: Readonly<Record<string, string>> = {
  purchase_time: '购买时间',
  merchant_name: '商家名称',
  product_name: '商品名称',
  paid_amount: '实付金额（元）',
  requested_resolution: '期望处理结果',
  problem_description: '问题描述',
}

const statusText = computed(() => {
  switch (autosave?.status.value ?? 'idle') {
    case 'saving':
      return '正在保存…'
    case 'conflict':
      return '保存冲突，请重新加载页面'
    case 'failed':
      return '保存失败，请重试'
    default:
      return '已保存到此设备'
  }
})

function fieldLabel(fieldName: string): string {
  return fieldLabels[fieldName] ?? fieldName
}

function inputId(fieldName: string): string {
  return `draft-${fieldName}`
}

function toDisplayValue(draft: FactDraft): string {
  if (draft.fieldName === 'paid_amount') {
    return fenToYuan(draft.value)
  }
  if (draft.fieldName === 'purchase_time') {
    return draft.value.slice(0, 16)
  }
  return draft.value
}

function toPersistedValue(draft: FactDraft, raw: string): string | null {
  if (draft.fieldName === 'paid_amount') {
    return yuanToFen(raw)
  }
  if (draft.fieldName === 'purchase_time') {
    return toUtcTimestamp(raw)
  }
  return raw
}

function toPlainDraft(draft: FactDraft, value: string, updatedAt: string): FactDraft {
  const base = {
    id: draft.id,
    caseId: draft.caseId,
    value,
    sourceRefs: draft.sourceRefs.map((source) => ({ evidenceId: source.evidenceId })),
    updatedAt,
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
  for (const draft of drafts.value) {
    const raw = values[draft.fieldName] ?? ''
    const value = toPersistedValue(draft, raw)
    if (value === null) {
      return null
    }
    savedDrafts.push(toPlainDraft(draft, value, now))
  }
  return savedDrafts
}

function scheduleSave(): void {
  if (autosave === null) {
    return
  }
  const savedDrafts = buildDraftsForSave()
  if (savedDrafts === null) {
    return
  }
  autosave.schedule(savedDrafts)
}

const onVisibilityChange = (): void => {
  if (document.visibilityState === 'hidden') {
    void autosave?.flush()
  }
}

onMounted(async () => {
  try {
    if (!capabilities.indexedDb) {
      loadError.value = '当前浏览器不支持本地存储，无法加载本地事件。'
      return
    }
    repository = await getCaseRepository()
    const aggregate = await loadCase(repository, caseId)
    if (aggregate === null) {
      notFound.value = true
      return
    }
    caseTitle.value = aggregate.caseEvent.title
    expectedRevision = aggregate.revision
    drafts.value = aggregate.factDrafts
    for (const draft of aggregate.factDrafts) {
      values[draft.fieldName] = toDisplayValue(draft)
    }
    autosave = createAutosave({
      persist: async (savedDrafts) => {
        if (repository === null) {
          throw new Error('repository_unavailable')
        }
        expectedRevision = await saveCaseDrafts(
          repository,
          caseId,
          expectedRevision,
          savedDrafts,
        )
      },
    })
    await acquire(caseId)
    document.addEventListener('visibilitychange', onVisibilityChange)
  } catch {
    loadError.value = '本地存储不可用，请重新加载页面。'
  } finally {
    loading.value = false
  }
})

async function retryAcquire(): Promise<void> {
  await acquire(caseId)
}

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  void release()
  void autosave?.dispose()
})
</script>

<template>
  <main class="workspace-shell">
    <a class="back" href="/">返回首页</a>
    <p v-if="loading">正在加载本地事件…</p>
    <section v-else-if="notFound" class="not-found">
      <h1>未找到本地事件</h1>
      <p>该事件不存在或已被删除。</p>
      <a href="/">返回首页</a>
    </section>
    <section v-else-if="loadError" class="load-error">
      <h1>无法加载事件</h1>
      <p>{{ loadError }}</p>
      <a href="/">返回首页</a>
    </section>
    <section v-else class="overview">
      <h1>{{ caseTitle }}</h1>
      <p class="save-status">{{ statusText }}</p>
      <nav class="workspace-nav" aria-label="事件工作台分区">
        <span class="nav-current">概览</span>
        <a :href="`/cases/${caseId}/materials`">材料</a>
        <a :href="`/cases/${caseId}/facts`">事实</a>
        <a :href="`/cases/${caseId}/timeline`">时间线</a>
      </nav>
      <p v-if="writeMode === 'writer'" class="write-mode">可编辑</p>
      <div v-else class="read-only">
        <p>另一标签页正在编辑，本页只读</p>
        <button type="button" @click="retryAcquire">获取编辑权</button>
      </div>
      <p v-if="!capabilities.opfs" class="notice">
        当前浏览器不支持 OPFS，材料导入与附件导出不可用。
      </p>
      <p v-if="!capabilities.webLocks || !capabilities.broadcastChannel" class="notice">
        当前浏览器不支持多标签页编辑保护，请避免同时在多个标签页编辑。
      </p>
      <div v-for="draft in drafts" :key="draft.id" class="field">
        <label :for="inputId(draft.fieldName)">{{ fieldLabel(draft.fieldName) }}</label>
        <input
          v-if="draft.fieldName === 'purchase_time'"
          :id="inputId(draft.fieldName)"
          v-model="values[draft.fieldName]"
          type="datetime-local"
          :disabled="writeMode === 'reader'"
          @input="scheduleSave"
        />
        <input
          v-else
          :id="inputId(draft.fieldName)"
          v-model="values[draft.fieldName]"
          type="text"
          :inputmode="draft.fieldName === 'paid_amount' ? 'decimal' : undefined"
          :disabled="writeMode === 'reader'"
          @input="scheduleSave"
        />
      </div>
      <p class="boundary">这里只整理事实与材料，不提供法律判断或结果预测。</p>
    </section>
  </main>
</template>

<style scoped>
.workspace-shell {
  width: min(100%, 36rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.back {
  color: #527067;
}

h1 {
  margin: 1rem 0 0.25rem;
  color: #173f35;
}

.save-status {
  margin: 0 0 1.25rem;
  color: #527067;
  font-weight: 700;
}

.workspace-nav {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #d3d7ce;
}

.workspace-nav a {
  color: #31564c;
  font-weight: 700;
}

.nav-current {
  color: #173f35;
  font-weight: 700;
}

.write-mode {
  display: inline-block;
  margin: 0 0 1rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: #dcebe2;
  color: #1d5c3a;
  font-weight: 700;
}

.read-only {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e0c5a6;
  border-radius: 0.6rem;
  background: #fdf3e5;
}

.read-only p {
  margin: 0 0 0.5rem;
  color: #8a4b1d;
  font-weight: 700;
}

.read-only button {
  padding: 0.45rem 0.85rem;
  border: 0;
  border-radius: 0.5rem;
  background: #8a4b1d;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.notice {
  color: #7a5a32;
  line-height: 1.6;
}

.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

label {
  color: #31564c;
  font-weight: 700;
}

input {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.5rem;
  background: #fff;
}

.boundary {
  margin-top: 1.5rem;
  color: #7a5a32;
  line-height: 1.6;
}
</style>
