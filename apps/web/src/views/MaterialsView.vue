<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { EvidenceCategory, EvidenceFile, UuidV4 } from '@youju/domain'
import { detectBrowserCapabilities } from '../browser/browser-capabilities.js'
import EvidenceImportField from '../components/EvidenceImportField.vue'
import EvidenceList from '../components/EvidenceList.vue'
import {
  importEvidenceFiles,
  listCaseEvidence,
  updateEvidenceCategory,
} from '../services/evidence-service.js'
import type { FileImportOutcome } from '../services/evidence-service.js'
import { getCaseRepository } from '../services/case-service.js'
import { deleteEvidence } from '../services/reference-service.js'
import { EvidenceReferencedError } from '../services/reference-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4
const capabilities = detectBrowserCapabilities()
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const importing = ref(false)
const evidence = ref<readonly EvidenceFile[]>([])
const messages = ref<readonly { fileName: string; text: string }[]>([])
const deleteError = ref('')
const referenceDetails = ref<string[]>([])

const errorTexts: Readonly<Record<string, string>> = {
  file_type_mismatch: '文件扩展名、类型与内容不一致',
  file_count_exceeded: '材料数量已达上限',
  file_too_large: '单文件超过 50 MiB',
  total_size_exceeded: '事件材料总量超过 500 MiB',
  storage_quota_exceeded: '本地存储空间不足',
}

onMounted(async () => {
  try {
    evidence.value = await listCaseEvidence(caseId)
  } finally {
    loading.value = false
  }
})

async function importFiles(files: File[]): Promise<void> {
  importing.value = true
  messages.value = []
  try {
    const outcomes = await importEvidenceFiles(caseId, files, 'other')
    evidence.value = await listCaseEvidence(caseId)
    messages.value = outcomes.map((outcome) => ({
      fileName: outcome.fileName,
      text: outcomeText(outcome),
    }))
  } catch {
    messages.value = [{ fileName: '', text: '导入失败，请重试' }]
  } finally {
    importing.value = false
  }
}

function outcomeText(outcome: FileImportOutcome): string {
  if (outcome.outcome === 'imported') {
    return '已导入'
  }
  if (outcome.outcome === 'duplicate') {
    return '重复材料，已跳过'
  }
  return errorTexts[outcome.errorCode ?? ''] ?? '导入失败'
}

async function applyCategory(payload: {
  evidenceId: string
  category: EvidenceCategory
}): Promise<void> {
  const updated = await updateEvidenceCategory(caseId, payload.evidenceId, payload.category)
  evidence.value = evidence.value.map((item) => (item.id === updated.id ? updated : item))
}

async function removeEvidenceItem(evidenceId: string): Promise<void> {
  deleteError.value = ''
  referenceDetails.value = []
  try {
    const repository = await getCaseRepository()
    const { getEvidenceBlobStore } = await import('../services/evidence-service.js')
    await deleteEvidence(caseId, evidenceId, repository, getEvidenceBlobStore())
    evidence.value = await listCaseEvidence(caseId)
  } catch (error) {
    if (error instanceof EvidenceReferencedError) {
      deleteError.value = '该材料被正式内容引用，不能删除'
      referenceDetails.value = error.references.map((reference) =>
        reference.type === 'confirmed_fact' ? '被确认事实引用' : '被时间线条目引用',
      )
    } else {
      deleteError.value = '删除失败，请重试'
    }
  }
}
</script>

<template>
  <main class="materials-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>材料管理</h1>

    <p v-if="!capabilities.opfs" class="opfs-warning">
      当前浏览器不能可靠保存原始材料
    </p>
    <template v-else>
      <EvidenceImportField :disabled="importing || !canWrite" @files="importFiles" />
      <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>
      <ul v-if="referenceDetails.length > 0" class="delete-references">
        <li v-for="(detail, index) in referenceDetails" :key="index">{{ detail }}</li>
      </ul>
      <ul v-if="messages.length > 0" class="messages">
        <li v-for="(message, index) in messages" :key="index">
          {{ message.fileName }}：{{ message.text }}
        </li>
      </ul>
    </template>

    <p v-if="loading">正在加载材料…</p>
    <EvidenceList
      v-else
      :evidence="evidence"
      :disabled="!canWrite"
      @category-change="applyCategory"
      @remove-evidence="removeEvidenceItem"
    />
    <p v-if="evidence.some((item) => item.categoryOrigin !== 'manual')" class="provenance-note">
      部分材料分类来自已确认的 AI 候选；手工修改分类后会清除该来源关联。
    </p>
  </main>
</template>

<style scoped>
.materials-shell {
  width: min(100%, 42rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.back {
  color: #527067;
}

h1 {
  color: #173f35;
}

.opfs-warning {
  padding: 0.75rem 1rem;
  border: 1px solid #e0c5a6;
  border-radius: 0.6rem;
  background: #fdf3e5;
  color: #8a4b1d;
  font-weight: 700;
}

.messages {
  padding-left: 1.25rem;
  color: #31564c;
  line-height: 1.7;
}

.delete-error {
  color: #a03b1e;
  font-weight: 700;
}

.delete-references {
  color: #7a4b20;
}

.provenance-note {
  color: #527067;
  font-size: 0.9rem;
}
</style>
