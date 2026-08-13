<script setup lang="ts">
import type { AiTaskType, ProviderErrorCode } from '@youju/ai-core'

const props = defineProps<{
  readonly taskType: AiTaskType
  readonly stage: string
  readonly currentBatch: number
  readonly totalBatches: number
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_consent'
  readonly errorCode?: ProviderErrorCode | null
}>()

const emit = defineEmits<{
  readonly cancel: []
}>()

const labels: Readonly<Record<AiTaskType, string>> = {
  classify_evidence: '分类材料',
  extract_facts: '提取事实候选',
  build_timeline: '建立时间线候选',
  draft_statement: '生成陈述草稿',
}
</script>

<template>
  <section data-testid="task-progress" aria-live="polite">
    <h3>{{ labels[taskType] }}</h3>
    <p>阶段：{{ stage }}</p>
    <p>批次 {{ currentBatch }} / {{ totalBatches }}</p>
    <p v-if="status === 'running'">运行中</p>
    <p v-else-if="status === 'completed'">已完成，候选内容仍需人工确认</p>
    <p v-else-if="status === 'cancelled'">已取消</p>
    <p v-else-if="status === 'awaiting_consent'">等待发送范围确认</p>
    <p v-else>失败：{{ errorCode }}</p>
    <p>刷新或关闭页面会中止任务；页面外不会继续运行。</p>
    <button v-if="status === 'running'" type="button" data-action="cancel" @click="emit('cancel')">取消任务</button>
  </section>
</template>
