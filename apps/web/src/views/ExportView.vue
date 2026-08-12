<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ExportPreflightResult } from '@youju/document-export'
import type { UuidV4 } from '@youju/domain'
import { loadExportState, prepareExportBundle } from '../services/export-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const blocked = ref(false)
const noStatement = ref(false)
const reasons = ref<string[]>([])
const warnings = ref<string[]>([])
const exporting = ref(false)
const message = ref('')

const reasonTexts: Readonly<Record<string, string>> = {
  missing_required_fact: '缺少必填事实',
  missing_required_source: '部分事实缺少来源材料',
  unresolved_conflict: '存在未解决的时间或事实冲突',
  timeline_unconfirmed: '时间线存在未确认条目',
  statement_missing: '尚未确认事实陈述',
  statement_stale: '事实陈述已过期，请重新确认',
  evidence_missing: '原始材料文件缺失',
  evidence_hash_mismatch: '材料摘要与记录不一致',
  opfs_unavailable: '当前浏览器不支持原始材料附件导出',
}

const warningTexts: Readonly<Record<string, string>> = {
  recommended_evidence_missing: '建议补充推荐材料',
}

function formatReason(reason: { code: string; fieldName?: string; evidenceCategory?: string }): string {
  const base = reasonTexts[reason.code] ?? reason.code
  if (reason.code === 'missing_required_fact' && reason.fieldName !== undefined) {
    return `${base}：${reason.fieldName}`
  }
  if (reason.code === 'recommended_evidence_missing' && reason.evidenceCategory !== undefined) {
    return `${base}：${reason.evidenceCategory}`
  }
  return base
}

async function refresh(): Promise<void> {
  const state = await loadExportState(caseId)
  if (state.snapshot === null || state.preflight === null) {
    noStatement.value = true
    blocked.value = false
    reasons.value = []
    warnings.value = []
    return
  }
  const preflight: ExportPreflightResult = state.preflight
  if (preflight.status === 'blocked') {
    blocked.value = true
    reasons.value = preflight.reasons.map((reason) => formatReason(reason))
    warnings.value = preflight.warnings.map((warning) => formatReason(warning))
  } else {
    blocked.value = false
    reasons.value = []
    warnings.value = preflight.warnings.map((warning) => formatReason(warning))
  }
}

async function generate(): Promise<void> {
  exporting.value = true
  message.value = ''
  try {
    const bundle = await prepareExportBundle(caseId)
    const url = URL.createObjectURL(bundle.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = bundle.fileName
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    message.value = `已生成材料包：${bundle.fileName}`
  } catch {
    message.value = '生成材料包失败，请检查缺口后重试。'
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  try {
    await refresh()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="export-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>导出材料包</h1>
    <p class="warning">
      材料包未加密，可能包含敏感个人信息，请妥善保存。建议先导出备份再继续。
    </p>
    <p v-if="loading">正在检查导出状态…</p>
    <template v-else>
      <p v-if="noStatement" class="blocked">尚未确认事实陈述，无法导出。</p>
      <template v-else>
        <p v-if="blocked" class="blocked">以下阻断项解决后才能导出：</p>
        <ul v-if="reasons.length > 0" class="reasons">
          <li v-for="(reason, index) in reasons" :key="index">{{ reason }}</li>
        </ul>
        <ul v-if="warnings.length > 0" class="warnings">
          <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
        </ul>
        <p v-if="message" class="message">{{ message }}</p>
        <button
          type="button"
          :disabled="blocked || exporting || !canWrite"
          class="export-button"
          @click="generate"
        >
          生成材料包
        </button>
      </template>
    </template>
  </main>
</template>

<style scoped>
.export-shell {
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

.warning {
  padding: 0.75rem 1rem;
  border: 1px solid #e0c5a6;
  border-radius: 0.6rem;
  background: #fdf3e5;
  color: #8a4b1d;
  font-weight: 700;
}

.blocked {
  color: #a03b1e;
  font-weight: 700;
}

.reasons {
  color: #a03b1e;
  line-height: 1.7;
}

.warnings {
  color: #7a5a32;
  line-height: 1.7;
}

.message {
  color: #1d5c3a;
  font-weight: 700;
}

.export-button {
  padding: 0.7rem 1.2rem;
  border: 0;
  border-radius: 0.5rem;
  background: #173f35;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.export-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
