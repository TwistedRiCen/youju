<script setup lang="ts">
defineProps<{ disabled: boolean }>()

const emit = defineEmits<{ files: [files: File[]] }>()

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  if (selected.length > 0) {
    emit('files', selected)
  }
  input.value = ''
}
</script>

<template>
  <label class="import-field">
    选择材料文件
    <input type="file" multiple :disabled="disabled" @change="onChange" />
  </label>
</template>

<style scoped>
.import-field {
  display: inline-block;
  padding: 0.7rem 1rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.6rem;
  background: #fff;
  color: #31564c;
  font-weight: 700;
  cursor: pointer;
}

.import-field input {
  display: none;
}

.import-field:has(input:disabled) {
  opacity: 0.6;
  cursor: wait;
}
</style>
