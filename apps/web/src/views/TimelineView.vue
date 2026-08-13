<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import type {
  ConfirmedFact,
  EvidenceFile,
  TimelineEntry,
  TimePrecision,
  UuidV4,
} from '@youju/domain'
import { selectCurrentConfirmedFacts } from '@youju/domain'
import { detectTimelineConflicts, sortTimeline } from '@youju/timeline'
import {
  confirmTimelineEntry,
  loadTimeline,
  reorderTimeline,
  saveTimelineDraft,
  toDisplayOccurredAt,
  toOccurredAt,
} from '../services/timeline-service.js'
import { listConfirmedFacts } from '../services/fact-service.js'
import { useCaseWriteAccess } from '../composables/use-case-write-access.js'

const route = useRoute()
const caseId = String(route.params.caseId ?? '') as UuidV4
const { canWrite } = useCaseWriteAccess()

const loading = ref(true)
const entries = shallowRef<readonly TimelineEntry[]>([])
const evidence = shallowRef<readonly EvidenceFile[]>([])
const currentFacts = shallowRef<readonly ConfirmedFact[]>([])

const formSummary = ref('')
const formPrecision = ref<TimePrecision>('minute')
const formTime = ref('')
const formSources = ref<string[]>([])

const sorted = computed(() => sortTimeline(entries.value))
const conflicts = computed(() =>
  detectTimelineConflicts({ entries: entries.value, currentFacts: currentFacts.value }),
)
const conflictTexts = computed(() =>
  conflicts.value.map((conflict) =>
    conflict.type === 'sequence_conflict' ? '时间顺序存在冲突' : '事实值存在冲突',
  ),
)
const exportBlocked = computed(() =>
  conflicts.value.length > 0 ? '存在冲突，阻止导出' : '',
)

const precisionLabels: Readonly<Record<TimePrecision, string>> = {
  minute: '精确到分钟',
  date: '精确到日期',
  approximate: '约略时间',
  unknown: '时间未知',
}

async function refresh(): Promise<void> {
  const snapshot = await loadTimeline(caseId)
  entries.value = snapshot.entries
  evidence.value = snapshot.evidence
}

async function addEntry(): Promise<void> {
  const summary = formSummary.value.trim()
  const precision = formPrecision.value
  const rawTime = formTime.value
  const sources = [...formSources.value]
  formSummary.value = ''
  formTime.value = ''
  formPrecision.value = 'minute'
  formSources.value = []

  const occurredAt = toOccurredAt(precision, rawTime)
  if (summary === '' || (precision !== 'unknown' && occurredAt === null)) {
    return
  }
  const nextOrder =
    entries.value.length === 0
      ? 0
      : Math.max(...entries.value.map((entry) => entry.sortOrder)) + 1
  const entry: TimelineEntry = {
    id: crypto.randomUUID(),
    caseId,
    occurredAt,
    timePrecision: precision,
    summary,
    detail: null,
    sourceRefs: sources.map((evidenceId) => ({ evidenceId })),
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
    status: 'draft',
    sortOrder: nextOrder,
  }
  await saveTimelineDraft(entry)
  await refresh()
}

async function confirmEntry(entry: TimelineEntry): Promise<void> {
  await confirmTimelineEntry(entry.id)
  await refresh()
}

async function move(entry: TimelineEntry, delta: -1 | 1): Promise<void> {
  const displayed = sorted.value
  const index = displayed.findIndex((item) => item.id === entry.id)
  const target = displayed[index + delta]
  if (index === -1 || target === undefined) {
    return
  }
  const ids = entries.value.map((item) => item.id)
  const firstIndex = ids.indexOf(entry.id)
  const secondIndex = ids.indexOf(target.id)
  if (firstIndex === -1 || secondIndex === -1) {
    return
  }
  const swapped = [...ids]
  ;[swapped[firstIndex], swapped[secondIndex]] = [
    swapped[secondIndex] as string,
    swapped[firstIndex] as string,
  ]
  await reorderTimeline(caseId, swapped)
  await refresh()
}

onMounted(async () => {
  try {
    await refresh()
    currentFacts.value = selectCurrentConfirmedFacts(await listConfirmedFacts(caseId))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="timeline-shell">
    <a class="back" :href="`/cases/${caseId}`">返回事件工作台</a>
    <h1>时间线</h1>

    <section class="add-form" aria-label="添加时间线">
      <div class="field">
        <label for="timeline-summary">摘要</label>
        <input id="timeline-summary" v-model="formSummary" type="text" :disabled="!canWrite" />
      </div>
      <div class="field">
        <label for="timeline-precision">精确度</label>
        <select id="timeline-precision" v-model="formPrecision" :disabled="!canWrite">
          <option v-for="precision in (['minute', 'date', 'approximate', 'unknown'] as const)"
            :key="precision"
            :value="precision">
            {{ precisionLabels[precision] }}
          </option>
        </select>
      </div>
      <div v-if="formPrecision === 'date'" class="field">
        <label for="timeline-date">日期</label>
        <input id="timeline-date" v-model="formTime" type="date" :disabled="!canWrite" />
      </div>
      <div v-else-if="formPrecision !== 'unknown'" class="field">
        <label for="timeline-time">时间</label>
        <input id="timeline-time" v-model="formTime" type="datetime-local" :disabled="!canWrite" />
      </div>
      <fieldset class="sources">
        <legend>关联材料</legend>
        <label v-for="item in evidence" :key="item.id" class="source-item">
          <input
            type="checkbox"
            :value="item.id"
            v-model="formSources"
            :disabled="!canWrite"
          />
          关联材料：{{ item.originalName }}
        </label>
      </fieldset>
      <button type="button" class="add-button" :disabled="!canWrite" @click="addEntry">
        添加时间线
      </button>
    </section>

    <p v-if="loading">正在加载时间线…</p>
    <template v-else>
      <p v-for="(text, index) in conflictTexts" :key="index" class="conflict">{{ text }}</p>
      <p v-if="exportBlocked" class="blocked">{{ exportBlocked }}</p>
      <ul class="timeline-list">
        <li v-for="entry in sorted" :key="entry.id" class="timeline-item">
          <h2>{{ entry.summary }}</h2>
          <p>{{ precisionLabels[entry.timePrecision] }}：{{ toDisplayOccurredAt(entry) }}</p>
          <p v-if="entry.contentOrigin !== 'manual'" class="provenance-badge">AI 候选已确认</p>
          <p v-if="entry.status === 'confirmed'" class="confirmed-badge">已确认</p>
          <button
            v-else
            type="button"
            :aria-label="`确认时间线：${entry.summary}`"
            :disabled="!canWrite"
            @click="confirmEntry(entry)"
          >
            确认
          </button>
          <div class="reorder">
            <button type="button" aria-label="上移" :disabled="!canWrite" @click="move(entry, -1)">
              上移
            </button>
            <button type="button" aria-label="下移" :disabled="!canWrite" @click="move(entry, 1)">
              下移
            </button>
          </div>
        </li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.timeline-shell {
  width: min(100%, 42rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.back {
  color: #527067;
}

h1,
h2 {
  color: #173f35;
}

.add-form {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
}

.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

label {
  color: #31564c;
  font-weight: 700;
}

input,
select {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.5rem;
  background: #fff;
}

.sources {
  display: grid;
  gap: 0.4rem;
  margin: 0 0 0.75rem;
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

.add-button {
  padding: 0.6rem 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: #173f35;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.conflict,
.blocked {
  color: #a03b1e;
  font-weight: 700;
}

.timeline-item {
  margin-bottom: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid #d3d7ce;
  border-radius: 0.7rem;
  background: #fffdf8;
  list-style: none;
}

.timeline-item h2 {
  margin: 0 0 0.3rem;
  font-size: 1rem;
}

.timeline-item p {
  margin: 0.2rem 0;
  color: #527067;
}

.confirmed-badge {
  color: #1d5c3a;
  font-weight: 700;
}

.provenance-badge {
  color: #7a5a32;
  font-weight: 700;
}

.reorder {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

button {
  padding: 0.4rem 0.8rem;
  border: 0;
  border-radius: 0.4rem;
  background: #31564c;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
</style>
