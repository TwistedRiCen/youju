<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { UuidV4 } from '@youju/domain'
import {
  confirmLatestStatement,
  generateStatementDraft,
  loadStatement,
  updateStatementDraft,
} from '../services/statement-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const content = ref('')
const hasConfirmed = ref(false)
const stale = ref(false)

async function refresh(): Promise<void> {
  const snapshot = await loadStatement(caseId)
  content.value = snapshot.latestConfirmed?.content ?? snapshot.draft?.content ?? ''
  hasConfirmed.value = snapshot.latestConfirmed !== null
  stale.value = snapshot.latestConfirmed !== null && !snapshot.isCurrent
}

async function generate(): Promise<void> {
  await generateStatementDraft(caseId)
  await refresh()
}

async function confirm(): Promise<void> {
  await confirmLatestStatement(caseId)
  await refresh()
}

async function saveEdit(): Promise<void> {
  await updateStatementDraft(caseId, content.value)
  await refresh()
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
  <main class="statement-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>事实陈述</h1>
    <p v-if="loading">正在加载陈述…</p>
    <template v-else>
      <p v-if="stale" class="stale">内容已过期，请重新确认</p>
      <p v-else-if="hasConfirmed" class="confirmed">陈述已确认</p>
      <textarea
        v-model="content"
        class="content"
        aria-label="事实陈述内容"
        rows="14"
        :disabled="!canWrite"
      ></textarea>
      <div class="actions">
        <button type="button" :disabled="!canWrite" @click="generate">生成事实陈述</button>
        <button type="button" :disabled="!canWrite || content === ''" @click="saveEdit">
          保存修改
        </button>
        <button type="button" :disabled="!canWrite || content === ''" @click="confirm">
          确认陈述
        </button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.statement-shell {
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

.content {
  width: 100%;
  padding: 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
  color: #18332c;
  line-height: 1.7;
  font: inherit;
}

.stale {
  color: #a03b1e;
  font-weight: 700;
}

.confirmed {
  color: #1d5c3a;
  font-weight: 700;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

button {
  padding: 0.6rem 1rem;
  border: 0;
  border-radius: 0.5rem;
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
