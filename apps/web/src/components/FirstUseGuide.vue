<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { AppPreferencesRepository } from '../storage/index.js'
import {
  recordOnboardingVersionSeen,
  shouldShowFirstUseGuide,
} from '../browser/storage-persistence.js'

const props = defineProps<{ preferences: AppPreferencesRepository }>()

const visible = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
const openButton = ref<HTMLButtonElement | null>(null)

async function focusDialog(): Promise<void> {
  await nextTick()
  const element = dialog.value
  if (element === null) {
    return
  }
  if (typeof element.showModal === 'function' && !element.open) {
    element.showModal()
  } else if (!element.open) {
    element.setAttribute('open', '')
  }
  element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

async function show(): Promise<void> {
  visible.value = true
  await focusDialog()
}

async function dismiss(): Promise<void> {
  await recordOnboardingVersionSeen(props.preferences).catch(() => undefined)
  if (dialog.value?.open) {
    if (typeof dialog.value.close === 'function') {
      dialog.value.close()
    } else {
      dialog.value.removeAttribute('open')
    }
  }
  visible.value = false
  await nextTick()
  openButton.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    void dismiss()
    return
  }
  if (event.key === 'Tab' && dialog.value !== null) {
    const buttons = [...dialog.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const first = buttons.at(0)
    const last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

onMounted(async () => {
  try {
    if (await shouldShowFirstUseGuide(props.preferences)) {
      await show()
    }
  } catch {
    await show()
  }
})
</script>

<template>
  <button
    ref="openButton"
    class="guide-trigger"
    type="button"
    data-action="open"
    @click="show"
  >
    查看首次使用说明
  </button>
  <dialog
    v-if="visible"
    ref="dialog"
    class="guide-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="first-use-title"
    @cancel.prevent="dismiss"
    @keydown="onKeydown"
  >
    <h2 id="first-use-title">首次使用有据</h2>
    <ol>
      <li data-guide-step>
        <strong>数据保存在本地</strong>
        <p>事件与原始材料默认只保存在当前浏览器；清理浏览器数据或更换设备可能导致丢失，请及时导出备份。</p>
      </li>
      <li data-guide-step>
        <strong>核心流程无需 AI</strong>
        <p>无需 AI 即可整理材料、事实、时间线、缺口和陈述。启用 AI 时需自带 API Key，并在发送前预览内容。</p>
      </li>
      <li data-guide-step>
        <strong>只整理事实与材料</strong>
        <p>有据不提供法律结论，不预测投诉或退款结果，也不会代替你发送投诉。</p>
      </li>
    </ol>
    <div class="guide-actions">
      <button type="button" data-action="skip" @click="dismiss">跳过</button>
      <button type="button" data-action="complete" @click="dismiss">我知道了</button>
    </div>
  </dialog>
</template>

<style scoped>
.guide-trigger {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 10;
  border: 1px solid #31564c;
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: #fff;
  color: #173f35;
}

.guide-dialog {
  position: fixed;
  inset: 50% auto auto 50%;
  z-index: 30;
  width: min(calc(100% - 2rem), 36rem);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  transform: translate(-50%, -50%);
  border: 1px solid #b9c7c1;
  border-radius: 0.9rem;
  padding: 1.25rem;
  background: #fff;
  box-shadow: 0 1rem 3rem rgb(23 63 53 / 24%);
  color: #18332c;
}

.guide-dialog::backdrop {
  background: rgb(23 63 53 / 38%);
}

.guide-dialog ol {
  display: grid;
  gap: 0.75rem;
  padding-left: 1.5rem;
  line-height: 1.6;
}

.guide-dialog p {
  margin: 0.25rem 0 0;
}

.guide-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.guide-actions button {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.65rem 1rem;
  background: #173f35;
  color: #fff;
  font-weight: 700;
}
</style>
