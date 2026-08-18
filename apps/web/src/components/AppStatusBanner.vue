<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PwaUpdateController } from '../pwa/update-controller.js'

const props = defineProps<{
  controller: PwaUpdateController
}>()

const readyAcknowledged = ref(false)
const status = computed(() => props.controller.status.value)
const online = computed(() => props.controller.online.value)

async function confirm(): Promise<void> {
  await props.controller.confirmUpdate()
}

function dismiss(): void {
  props.controller.dismissUpdate()
  // Suppress the offline-ready notice that would otherwise reappear right
  // after dismissing the update prompt.
  readyAcknowledged.value = true
}
</script>

<template>
  <aside
    v-if="!online || status === 'update_available' || status === 'updating' || (status === 'offline_ready' && !readyAcknowledged)"
    class="app-status"
    role="status"
  >
    <template v-if="!online">
      <strong>当前离线</strong>
      <span>页面未连接网络；失败请求保留自己的错误，不会被自动重发或排队。</span>
    </template>
    <template v-else-if="status === 'offline_ready'">
      <strong>已可离线使用</strong>
      <span>应用外壳与演示材料已缓存；AI 与其他网络功能需要联网。</span>
      <button type="button" data-action="acknowledge-ready" @click="readyAcknowledged = true">知道了</button>
    </template>
    <template v-else-if="status === 'update_available'">
      <strong>发现新版本</strong>
      <span>更新会重新加载页面并清空页面会话中的 API Key；正在进行的导入、导出、AI 任务或未保存写入会先完成。</span>
      <button type="button" data-action="confirm-update" @click="confirm">立即更新</button>
      <button type="button" data-action="dismiss-update" @click="dismiss">稍后</button>
    </template>
    <template v-else-if="status === 'updating'">
      <strong>正在等待当前操作完成后更新…</strong>
    </template>
  </aside>
</template>

<style scoped>
.app-status {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.75rem;
  padding: 0.7rem 1rem;
  border-bottom: 2px solid #8f431d;
  background: #fff0e5;
  color: #812f0e;
  line-height: 1.5;
}
.app-status button {
  margin-left: auto;
  padding: 0.35rem 0.7rem;
  border: 1px solid #812f0e;
  border-radius: 0.45rem;
  background: #fff;
  color: #812f0e;
  font-weight: 700;
}
</style>
