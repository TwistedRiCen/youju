<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { RouterView } from 'vue-router'
import FirstUseGuide from './components/FirstUseGuide.vue'
import StoragePersistenceNotice from './components/StoragePersistenceNotice.vue'
import { getAppPreferencesRepository } from './browser/storage-persistence.js'
import type { AppPreferencesRepository } from './storage/index.js'

const preferences = shallowRef<AppPreferencesRepository | null>(null)

onMounted(async () => {
  try {
    preferences.value = await getAppPreferencesRepository()
  } catch {
    preferences.value = null
  }
})
</script>

<template>
  <StoragePersistenceNotice v-if="preferences !== null" :preferences="preferences" />
  <RouterView />
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
</style>
