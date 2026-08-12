<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { UuidV4 } from '@youju/domain'
import { selectCurrentConfirmedFacts } from '@youju/domain'
import { getCaseRepository } from '../services/case-service.js'
import { deleteCasePermanently } from '../services/delete-case-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

const route = useRoute()
const router = useRouter()
const caseId = String(route.params.caseId ?? '') as UuidV4
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const title = ref('')
const counts = ref({ evidence: 0, facts: 0, timeline: 0, statement: 0 })
const deleting = ref(false)
const message = ref('')
const failed = ref(false)

const enteredTitle = ref('')
const titleMatches = computed(() => enteredTitle.value === title.value && title.value !== '')

onMounted(async () => {
  try {
    const repository = await getCaseRepository()
    const aggregate = await repository.getCase(caseId)
    if (aggregate !== null) {
      title.value = aggregate.caseEvent.title
    }
    counts.value = {
      evidence: (await repository.listEvidence(caseId)).length,
      facts: selectCurrentConfirmedFacts(await repository.listConfirmedFacts(caseId)).length,
      timeline: (await repository.listTimeline(caseId)).length,
      statement: (await repository.listConfirmedStatements(caseId)).length,
    }
  } finally {
    loading.value = false
  }
})

async function deleteCase(): Promise<void> {
  if (!titleMatches.value || deleting.value) {
    return
  }
  deleting.value = true
  message.value = ''
  failed.value = false
  try {
    const repository = await getCaseRepository()
    const { getEvidenceBlobStore } = await import('../services/evidence-service.js')
    const result = await deleteCasePermanently(
      {
        caseId,
        operationId: crypto.randomUUID(),
        expectedTitle: title.value,
        enteredTitle: enteredTitle.value,
        startedAt: new Date().toISOString(),
      },
      { repository, blobStore: getEvidenceBlobStore() },
    )
    if (result.status === 'deleted') {
      message.value = '已删除'
      await router.push('/')
    } else {
      failed.value = true
      message.value = '删除未完成，仍有数据残留，请重试'
    }
  } catch {
    failed.value = true
    message.value = '删除失败，请重试'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <main class="delete-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>删除本地事件</h1>
    <p class="warning">删除不可撤销，且不会保留任何备份。建议先导出材料包再删除。</p>
    <p v-if="loading">正在统计本地数据…</p>
    <template v-else>
      <ul class="counts">
        <li>材料数量：{{ counts.evidence }}</li>
        <li>已确认事实：{{ counts.facts }}</li>
        <li>时间线条目：{{ counts.timeline }}</li>
        <li>已确认陈述：{{ counts.statement }}</li>
      </ul>
      <div class="field">
        <label for="delete-title-confirm">输入事件标题以确认删除</label>
        <input
          id="delete-title-confirm"
          v-model="enteredTitle"
          type="text"
          :disabled="!canWrite"
        />
      </div>
      <p v-if="message" class="message" :class="{ failed }">{{ message }}</p>
      <button
        type="button"
        :disabled="!canWrite || !titleMatches || deleting"
        @click="deleteCase"
      >
        永久删除
      </button>
    </template>
  </main>
</template>

<style scoped>
.delete-shell {
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
  border: 1px solid #e0b3a4;
  border-radius: 0.6rem;
  background: #fdf0ea;
  color: #a03b1e;
  font-weight: 700;
}

.counts {
  line-height: 1.8;
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
  padding: 0.6rem 0.75rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.5rem;
  background: #fff;
}

button {
  padding: 0.7rem 1.2rem;
  border: 0;
  border-radius: 0.5rem;
  background: #a03b1e;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.message {
  color: #1d5c3a;
  font-weight: 700;
}

.message.failed {
  color: #a03b1e;
}
</style>
