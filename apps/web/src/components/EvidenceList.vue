<script setup lang="ts">
import type { EvidenceCategory, EvidenceFile } from '@youju/domain'
import { EVIDENCE_CATEGORY_LABELS } from '../services/evidence-service.js'

const props = defineProps<{
  evidence: readonly EvidenceFile[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  categoryChange: [payload: { evidenceId: string; category: EvidenceCategory }]
  removeEvidence: [evidenceId: string]
}>()

const categories = Object.keys(EVIDENCE_CATEGORY_LABELS) as EvidenceCategory[]

function onChange(evidenceId: string, event: Event): void {
  const select = event.target as HTMLSelectElement
  emit('categoryChange', {
    evidenceId,
    category: select.value as EvidenceCategory,
  })
}
</script>

<template>
  <section class="evidence-list" aria-label="材料列表">
    <p v-if="props.evidence.length === 0" class="empty">还没有导入材料。</p>
    <ul v-else>
      <li v-for="item in props.evidence" :key="item.id" class="evidence-item">
        <h2>{{ item.originalName }}</h2>
        <label class="category-label" :for="`category-${item.id}`">分类</label>
        <select
          :id="`category-${item.id}`"
          :aria-label="`分类：${item.originalName}`"
          :disabled="props.disabled ?? false"
          :value="item.category"
          @change="onChange(item.id, $event)"
        >
          <option v-for="category in categories" :key="category" :value="category">
            {{ EVIDENCE_CATEGORY_LABELS[category] }}
          </option>
        </select>
        <p>大小：{{ item.size }} 字节</p>
        <p>导入时间：{{ item.importedAt }}</p>
        <p class="hash">SHA-256：{{ item.sha256 }}</p>
        <button
          type="button"
          class="remove-button"
          :aria-label="`删除材料：${item.originalName}`"
          :disabled="props.disabled ?? false"
          @click="emit('removeEvidence', item.id)"
        >
          删除材料
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.evidence-item {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
  list-style: none;
}

.evidence-item h2 {
  margin: 0 0 0.5rem;
  color: #173f35;
  font-size: 1rem;
}

.category-label {
  margin-right: 0.5rem;
  color: #31564c;
  font-weight: 700;
}

select {
  padding: 0.3rem 0.5rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.4rem;
  background: #fff;
}

.hash {
  overflow-wrap: anywhere;
  color: #527067;
}

.empty {
  color: #527067;
}

.remove-button {
  margin-top: 0.5rem;
  padding: 0.4rem 0.8rem;
  border: 0;
  border-radius: 0.4rem;
  background: #a03b1e;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
</style>
