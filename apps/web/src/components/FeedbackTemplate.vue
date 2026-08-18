<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  releaseId: string
}>()

const description = ref('')
const message = ref('')

const safeReleaseId = computed(() => {
  const value = props.releaseId.trim()
  return /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : '未生成'
})

function sanitizeFeedback(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 2_000)
}

async function copyFeedback(): Promise<void> {
  const body = sanitizeFeedback(description.value)
  const template = `有据反馈\n发布编号：${safeReleaseId.value}\n问题描述：\n${body}`
  try {
    await navigator.clipboard.writeText(template)
    message.value = '反馈模板已复制。请在发送前再次检查，不要包含敏感信息。'
  } catch {
    message.value = '复制失败，请手工复制输入内容。'
  }
}
</script>

<template>
  <section class="feedback" aria-labelledby="feedback-title">
    <h2 id="feedback-title">反馈</h2>
    <p class="privacy-warning">
      请不要粘贴订单号、聊天记录、地址、手机号、API Key、原始材料或截图。模板不会自动收集事件 ID、文件名、网址或浏览器信息。
    </p>
    <label for="feedback-description">问题描述（由你主动填写）</label>
    <textarea id="feedback-description" v-model="description" maxlength="2000" rows="5" />
    <button type="button" data-action="copy-feedback" @click="copyFeedback">复制反馈模板</button>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.feedback { margin-top: 1.5rem; padding: 1.2rem; border: 1px solid #d3d7ce; border-radius: 0.75rem; background: #fffdf8; }
h2 { margin-top: 0; color: #173f35; }
.privacy-warning { color: #8a4b1d; line-height: 1.65; }
label { display: block; margin-bottom: 0.4rem; font-weight: 700; }
textarea { width: 100%; padding: 0.7rem; border: 1px solid #c8cdc5; border-radius: 0.5rem; resize: vertical; }
button { margin-top: 0.75rem; padding: 0.7rem 1rem; border: 0; border-radius: 0.5rem; background: #173f35; color: #fff; font-weight: 700; }
</style>
