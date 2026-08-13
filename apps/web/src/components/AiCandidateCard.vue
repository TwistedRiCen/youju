<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AiCandidate } from '@youju/ai-core'

const props = withDefaults(defineProps<{
  readonly candidate: AiCandidate
  readonly originalName?: string
  readonly selected?: boolean
  readonly batchEligible?: boolean
  readonly disabled?: boolean
}>(), {
  originalName: '来源材料未找到',
  selected: false,
  batchEligible: false,
  disabled: false,
})

const emit = defineEmits<{
  readonly confirm: []
  readonly editConfirm: [value: string]
  readonly reject: []
  readonly select: [selected: boolean]
}>()

function editableValue(candidate: AiCandidate): string {
  switch (candidate.candidateType) {
    case 'classification':
      return candidate.category
    case 'fact':
      return candidate.value
    case 'timeline':
      return candidate.summary
    case 'statement':
      return candidate.text
  }
}

const editValue = ref(editableValue(props.candidate))
watch(() => props.candidate, (candidate) => {
  editValue.value = editableValue(candidate)
})

function displayValue(candidate: AiCandidate): string {
  switch (candidate.candidateType) {
    case 'classification':
      return `${candidate.category}：${candidate.value}`
    case 'fact':
      return `${candidate.fieldName}：${candidate.value}`
    case 'timeline':
      return `${candidate.summary}${candidate.detail === null ? '' : `：${candidate.detail}`}`
    case 'statement':
      return candidate.text
  }
}

function candidateTypeLabel(candidate: AiCandidate): string {
  switch (candidate.candidateType) {
    case 'classification': return '材料分类'
    case 'fact': return '事实候选'
    case 'timeline': return '时间线候选'
    case 'statement': return '陈述草稿候选'
  }
}

function reviewGroupLabel(status: AiCandidate['reviewStatus']): string {
  if (status === 'pending') return '待确认'
  if (status === 'conflicted') return '冲突'
  return '已处理'
}
</script>

<template>
  <article class="ai-candidate-card" :data-candidate-id="candidate.id">
    <header>
      <span class="candidate-badge">AI 候选</span>
      <strong>{{ candidateTypeLabel(candidate) }}</strong>
      <span>审核分组：{{ reviewGroupLabel(candidate.reviewStatus) }}</span>
      <span>审核状态：{{ candidate.reviewStatus }}</span>
      <span>AI 置信度：{{ candidate.confidenceLevel }}</span>
    </header>

    <p class="candidate-value">{{ displayValue(candidate) }}</p>

    <ul class="provenance">
      <li v-for="location in candidate.sourceLocations" :key="`${location.evidenceId}-${location.page}`">
        来源：{{ originalName }}，第 {{ location.page }} 页
        <span v-if="location.region">
          （区域 {{ location.region.x }}, {{ location.region.y }}，{{ location.region.width }} × {{ location.region.height }}）
        </span>
      </li>
    </ul>

    <label v-if="candidate.reviewStatus === 'pending' || candidate.reviewStatus === 'conflicted'" class="edit-field">
      编辑后确认
      <textarea v-model="editValue" :disabled="disabled" data-testid="candidate-edit-value" rows="3"></textarea>
    </label>

    <label v-if="candidate.reviewStatus === 'pending' && batchEligible" class="batch-select">
      <input
        type="checkbox"
        :checked="selected"
        :disabled="disabled"
        @change="emit('select', ($event.target as HTMLInputElement).checked)"
      />
      纳入批量确认
    </label>

    <div v-if="candidate.reviewStatus === 'pending' || candidate.reviewStatus === 'conflicted'" class="actions">
      <button
        v-if="candidate.reviewStatus === 'pending'"
        type="button"
        data-action="confirm"
        :disabled="disabled"
        @click="emit('confirm')"
      >
        确认
      </button>
      <button type="button" data-action="edit-confirm" :disabled="disabled" @click="emit('editConfirm', editValue)">
        编辑后确认
      </button>
      <button type="button" data-action="reject" :disabled="disabled" @click="emit('reject')">
        拒绝
      </button>
    </div>
  </article>
</template>
