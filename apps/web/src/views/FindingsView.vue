<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { UuidV4 } from '@youju/domain'
import { loadFindings } from '../services/statement-service.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4

const loading = ref(true)
const findings = ref<readonly { severity: string; message: string; sourceReference: string }[]>([])
const ruleVersion = ref('')

onMounted(async () => {
  try {
    const snapshot = await loadFindings(caseId)
    findings.value = snapshot.findings
    ruleVersion.value = snapshot.ruleVersion
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="findings-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>缺口检查</h1>
    <p class="rule-version">规则版本：{{ ruleVersion }}</p>
    <p v-if="loading">正在检查缺口…</p>
    <p v-else-if="findings.length === 0" class="empty">没有发现缺口。</p>
    <ul v-else>
      <li
        v-for="(finding, index) in findings"
        :key="`${finding.sourceReference}-${index}`"
        class="finding"
        :class="finding.severity"
      >
        <span class="severity">{{ finding.severity === 'blocking' ? '阻断' : '警告' }}</span>
        {{ finding.message }}
      </li>
    </ul>
  </main>
</template>

<style scoped>
.findings-shell {
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

.rule-version {
  color: #527067;
}

.finding {
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.6rem;
  background: #fffdf8;
  list-style: none;
  line-height: 1.6;
}

.finding.blocking {
  border-color: #e0b3a4;
  background: #fdf0ea;
}

.severity {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #e8d8c5;
  color: #7a4b20;
  font-size: 0.8rem;
  font-weight: 700;
}

.blocking .severity {
  background: #e8b4a2;
  color: #7a2412;
}

.empty {
  color: #527067;
}
</style>
