<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { RouterView } from 'vue-router'
import FirstUseGuide from './components/FirstUseGuide.vue'
import StoragePersistenceNotice from './components/StoragePersistenceNotice.vue'
import AppStatusBanner from './components/AppStatusBanner.vue'
import { getAppPreferencesRepository } from './browser/storage-persistence.js'
import { getPwaUpdateController } from './pwa/update-controller.js'
import type { AppPreferencesRepository } from './storage/index.js'

const preferences = shallowRef<AppPreferencesRepository | null>(null)
const pwaController = getPwaUpdateController()

onMounted(async () => {
  try {
    preferences.value = await getAppPreferencesRepository()
  } catch {
    preferences.value = null
  }
})
</script>

<template>
  <AppStatusBanner v-if="pwaController !== null" :controller="pwaController" />
  <StoragePersistenceNotice v-if="preferences !== null" :preferences="preferences" />
  <RouterView />
  <footer class="public-footer">
    <a href="/">首页</a>
    <a href="/privacy">隐私与数据边界</a>
    <a href="/about">关于、版本与反馈</a>
  </footer>
  <FirstUseGuide v-if="preferences !== null" :preferences="preferences" />
</template>

<style>
:root {
  color: #18332c;
  background: #f4f1ea;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
textarea,
select {
  font: inherit;
}

.public-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  padding: 1.25rem;
  border-top: 1px solid #d3d7ce;
}

.public-footer a {
  color: #31564c;
  font-weight: 700;
}
</style>
