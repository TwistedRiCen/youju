<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type {
  AppPreferencesRepository,
  StoragePersistenceStatus,
} from '../storage/index.js'
import {
  retryStoragePersistence,
  subscribeStoragePersistence,
} from '../browser/storage-persistence.js'
import { detectBrowserCapabilities } from '../browser/browser-capabilities.js'

const props = withDefaults(defineProps<{
  preferences: AppPreferencesRepository
  storagePersistenceSupported?: boolean | null
}>(), {
  storagePersistenceSupported: null,
})

const status = ref<StoragePersistenceStatus>('unknown')
const retrying = ref(false)
let unsubscribe: (() => void) | null = null
const supported = computed(
  () => props.storagePersistenceSupported ?? detectBrowserCapabilities().storagePersistence,
)
const displayStatus = computed<StoragePersistenceStatus>(() =>
  supported.value ? status.value : 'unsupported',
)

onMounted(async () => {
  try {
    status.value = (await props.preferences.get())?.storagePersistence ?? 'unknown'
  } catch {
    status.value = 'denied'
  }
  unsubscribe = subscribeStoragePersistence((nextStatus) => {
    status.value = nextStatus
  })
})

onUnmounted(() => unsubscribe?.())

async function retry(): Promise<void> {
  if (retrying.value) {
    return
  }
  retrying.value = true
  try {
    status.value = await retryStoragePersistence(props.preferences)
  } catch {
    status.value = 'denied'
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <aside v-if="displayStatus !== 'unknown'" class="storage-notice" aria-live="polite">
    <template v-if="displayStatus === 'granted'">
      <strong>浏览器已允许持久保存</strong>
      <span>数据仍只在当前设备；主动清理浏览器数据仍会删除内容，请继续定期导出备份。</span>
    </template>
    <template v-else-if="displayStatus === 'denied'">
      <strong>浏览器未确认持久保存</strong>
      <span>浏览器可能在存储压力或会话结束后清理本地数据，请及时导出备份。</span>
      <button type="button" :disabled="retrying" @click="retry">
        {{ retrying ? '正在请求…' : '再次请求持久保存' }}
      </button>
    </template>
    <template v-else>
      <strong>当前浏览器不支持请求持久保存</strong>
      <span>本地数据可能被浏览器清理，请及时导出备份；应用不会宣称已获得持久化权限。</span>
    </template>
  </aside>
</template>

<style scoped>
.storage-notice {
  position: relative;
  z-index: 9;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  align-items: center;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #e0c5a6;
  background: #fdf3e5;
  color: #704317;
  line-height: 1.5;
}

.storage-notice button {
  border: 1px solid currentcolor;
  border-radius: 0.45rem;
  padding: 0.35rem 0.65rem;
  background: transparent;
  color: inherit;
  font-weight: 700;
}
</style>
