<script setup lang="ts">
import type { CaseEvent } from '@youju/domain'

defineProps<{ caseEvent: CaseEvent }>()
</script>

<template>
  <aside
    v-if="caseEvent.dataOrigin === 'fictional_demo'"
    class="demo-banner"
    role="status"
  >
    <strong>完全虚构演示数据</strong>
    <span>仅用于体验有据，请勿作为真实材料提交。</span>
  </aside>
</template>

<style scoped>
.demo-banner {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  padding: 0.7rem 1rem;
  border-bottom: 2px solid #b45324;
  background: #fff0e5;
  color: #812f0e;
  line-height: 1.5;
}
</style>
