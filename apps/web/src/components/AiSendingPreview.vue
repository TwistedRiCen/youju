<script setup lang="ts">
import { computed } from 'vue'
import { estimateTextTokens, type ProviderPreset } from '@youju/ai-core'
import type { UuidV4 } from '@youju/domain'
import type { DerivedMedia } from '../ai/derived-media.js'

interface PreviewMaterial {
  readonly id: UuidV4
  readonly originalName: string
  readonly pages: readonly DerivedMedia[]
}

interface ConfirmedTextField {
  readonly name: string
  readonly value: string
}

const props = withDefaults(defineProps<{
  readonly providerPreset: ProviderPreset
  readonly modelName: string
  readonly materials: readonly PreviewMaterial[]
  readonly confirmedTextFields?: readonly ConfirmedTextField[]
  readonly batchCount: number
  readonly possibleRepair?: boolean
}>(), {
  confirmedTextFields: () => [],
  possibleRepair: false,
})

const emit = defineEmits<{
  readonly removePage: [materialId: UuidV4, page: number]
  readonly removeMaterial: [materialId: UuidV4]
  readonly expandRequested: []
}>()

const pageCount = computed(() => props.materials.reduce((total, material) => total + material.pages.length, 0))
const pixelCount = computed(() => props.materials.reduce(
  (total, material) => total + material.pages.reduce((pages, page) => pages + page.width * page.height, 0),
  0,
))
const byteCount = computed(() => props.materials.reduce(
  (total, material) => total + material.pages.reduce((pages, page) => pages + page.bytes.byteLength, 0),
  0,
))
const estimatedTokens = computed(() => estimateTextTokens(props.confirmedTextFields.map((field) => field.value).join('\n')))
</script>

<template>
  <section class="ai-sending-preview" aria-labelledby="sending-preview-title">
    <h2 id="sending-preview-title">发送前确认</h2>
    <p>Provider：{{ providerPreset }}</p>
    <p>模型：{{ modelName }}</p>
    <p>批次：{{ batchCount }}</p>

    <section aria-labelledby="materials-title">
      <h3 id="materials-title">将发送的派生页面</h3>
      <ul>
        <li v-for="material in materials" :key="material.id">
          <strong>{{ material.originalName }}</strong>
          <button type="button" @click="emit('removeMaterial', material.id)">移除材料</button>
          <ul>
            <li v-for="page in material.pages" :key="`${material.id}-${page.page}`">
              <img :src="page.previewUrl" :alt="`${material.originalName} 第 ${page.page} 页缩略图`" />
              <span>第 {{ page.page }} 页</span>
              <span>{{ page.width }} × {{ page.height }} px</span>
              <span>{{ page.bytes.byteLength }} bytes</span>
              <button type="button" @click="emit('removePage', material.id, page.page)">移除页面</button>
            </li>
          </ul>
        </li>
      </ul>
      <p>页面：{{ pageCount }}；像素：{{ pixelCount }}；派生字节：{{ byteCount }}；估算文本 token：{{ estimatedTokens }}</p>
    </section>

    <section aria-labelledby="confirmed-text-title">
      <h3 id="confirmed-text-title">将发送的已确认文字</h3>
      <dl>
        <template v-for="field in confirmedTextFields" :key="field.name">
          <dt>{{ field.name }}</dt>
          <dd>{{ field.value }}</dd>
        </template>
      </dl>
    </section>

    <p v-if="possibleRepair">可能进行一次结构修复调用。</p>
    <p>费用以 Provider 实际账单为准。</p>
    <p>如需扩大材料、页面或文字范围，必须重新完整确认。</p>
    <button type="button" @click="emit('expandRequested')">重新选择发送范围</button>
  </section>
</template>
