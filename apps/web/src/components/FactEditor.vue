<script setup lang="ts">
import type { EvidenceFile, FactFieldName } from '@youju/domain'
import { requiresEvidenceSource } from '@youju/domain'

const props = defineProps<{
  fieldName: FactFieldName
  label: string
  value: string
  inputType?: 'text' | 'datetime-local'
  inputMode?: 'decimal' | 'text'
  disabled: boolean
  evidence?: readonly EvidenceFile[]
  selectedSourceIds?: readonly string[]
}>()

const emit = defineEmits<{
  updateValue: [value: string]
  updateSourceIds: [sourceIds: readonly string[]]
  confirm: []
}>()

const needsSource = requiresEvidenceSource(props.fieldName)

function updateSourceIds(event: Event): void {
  const input = event.target as HTMLInputElement
  const next = new Set(props.selectedSourceIds ?? [])
  if (input.checked) {
    next.add(input.value)
  } else {
    next.delete(input.value)
  }
  emit('updateSourceIds', [...next])
}
</script>

<template>
  <div class="fact-editor">
    <label :for="`fact-${props.fieldName}`">{{ props.label }}</label>
    <input
      :id="`fact-${props.fieldName}`"
      :type="props.inputType ?? 'text'"
      :inputmode="props.inputMode"
      :value="props.value"
      :disabled="props.disabled"
      @input="emit('updateValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="needsSource" class="source-warning">正式导出前必须关联材料</p>
    <fieldset v-if="needsSource" class="sources">
      <legend>关联材料</legend>
      <label v-for="item in props.evidence ?? []" :key="item.id" class="source-item">
        <input
          type="checkbox"
          :value="item.id"
          :checked="props.selectedSourceIds?.includes(item.id) ?? false"
          :disabled="props.disabled"
          @change="updateSourceIds"
        />
        {{ item.originalName }}
      </label>
      <p v-if="(props.evidence ?? []).length === 0" class="empty-sources">暂无可关联的材料</p>
    </fieldset>
    <button
      type="button"
      :disabled="props.disabled || props.value === ''"
      :aria-label="`确认事实：${props.label}`"
      @click="emit('confirm')"
    >
      确认事实
    </button>
  </div>
</template>

<style scoped>
.fact-editor {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
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

.source-warning {
  margin: 0;
  color: #9b491e;
  font-weight: 700;
}

.sources {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.5rem;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}

.source-item input {
  width: auto;
}

.empty-sources {
  margin: 0;
  color: #7a5a32;
}

button {
  justify-self: start;
  padding: 0.5rem 0.9rem;
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
