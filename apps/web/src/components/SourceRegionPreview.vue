<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { EvidenceMediaType, UuidV4 } from '@youju/domain'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import { deriveImagePage, releaseDerivedMedia, type DerivedMedia } from '../ai/derived-media.js'
import { renderPdfPages } from '../ai/pdf-page-renderer.js'

interface Region {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface DerivePageInput {
  readonly evidenceId: UuidV4
  readonly source: Blob
  readonly mediaType: EvidenceMediaType
  readonly page: number
  readonly signal: AbortSignal
  readonly sourceToken: UuidV4
}

type DerivePage = (input: DerivePageInput) => Promise<DerivedMedia>

const props = defineProps<{
  readonly evidenceId: UuidV4
  readonly storageRef: string
  readonly mediaType: EvidenceMediaType
  readonly page: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly region?: Region
  readonly blobStore: Pick<EvidenceBlobStore, 'read'>
  readonly derivePage?: DerivePage
}>()

const preview = ref<DerivedMedia | null>(null)
const errorCode = ref<string | null>(null)
const controller = new AbortController()
const PREVIEW_ERROR_CODES = new Set([
  'canvas_context_unavailable',
  'derived_image_too_large',
  'invalid_source_region',
  'pdf_page_encode_failed',
  'pdf_page_out_of_range',
  'source_dimensions_mismatch',
  'storage_unavailable',
])

function percent(value: number): string {
  return `${Number(value.toFixed(6))}%`
}

function checkRegion(region: Region | undefined): void {
  if (region === undefined) return
  if (
    region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 ||
    region.x + region.width > props.pixelWidth || region.y + region.height > props.pixelHeight
  ) {
    throw new Error('invalid_source_region')
  }
}

async function derive(input: DerivePageInput): Promise<DerivedMedia> {
  if (props.derivePage !== undefined) {
    return props.derivePage(input)
  }
  if (input.mediaType === 'application/pdf') {
    const pages = await renderPdfPages({
      evidenceId: input.evidenceId,
      source: input.source,
      pages: [input.page],
      signal: input.signal,
      sourceTokenFactory: () => input.sourceToken,
    })
    const page = pages[0]
    if (page === undefined) throw new Error('pdf_page_out_of_range')
    return page
  }
  return deriveImagePage({
    evidenceId: input.evidenceId,
    source: input.source,
    page: input.page,
    signal: input.signal,
    sourceToken: input.sourceToken,
  })
}

onMounted(async () => {
  try {
    checkRegion(props.region)
    const source = await props.blobStore.read(props.storageRef)
    const derived = await derive({
      evidenceId: props.evidenceId,
      source,
      mediaType: props.mediaType,
      page: props.page,
      signal: controller.signal,
      sourceToken: crypto.randomUUID() as UuidV4,
    })
    if (derived.width !== props.pixelWidth || derived.height !== props.pixelHeight) {
      releaseDerivedMedia([derived])
      throw new Error('source_dimensions_mismatch')
    }
    preview.value = derived
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    errorCode.value = PREVIEW_ERROR_CODES.has(message) ? message : 'source_preview_failed'
  }
})

onUnmounted(() => {
  controller.abort()
  if (preview.value !== null) {
    releaseDerivedMedia([preview.value])
  }
})
</script>

<template>
  <figure class="source-region-preview">
    <div v-if="preview !== null" class="preview-canvas">
      <img :src="preview.previewUrl" alt="来源页面预览" />
      <span
        v-if="region"
        data-testid="source-region"
        class="source-region"
        :style="{
          left: percent((region.x / pixelWidth) * 100),
          top: percent((region.y / pixelHeight) * 100),
          width: percent((region.width / pixelWidth) * 100),
          height: percent((region.height / pixelHeight) * 100),
        }"
        aria-label="来源区域"
      ></span>
    </div>
    <p v-else-if="errorCode">来源预览不可用：{{ errorCode }}</p>
    <p v-else>正在加载来源预览…</p>
  </figure>
</template>
