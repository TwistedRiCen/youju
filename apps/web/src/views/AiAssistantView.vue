<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AiTaskType, ProviderErrorCode } from '@youju/ai-core'
import type { UuidV4 } from '@youju/domain'
import { getAiSession } from '../ai/ai-session.js'
import { AiApiClientError } from '../ai/ai-api-client.js'
import type { AiTaskRunner, RunAiTaskCommand, RunAiTaskResult } from '../ai/ai-task-runner.js'
import { AiTaskRunnerError } from '../ai/ai-task-runner.js'
import AiTaskProgress from '../components/AiTaskProgress.vue'
import { beginActivity, endActivity } from '../pwa/update-controller.js'

const props = defineProps<{
  readonly caseId: UuidV4
  readonly runner?: AiTaskRunner | null
  readonly taskFactory?: (taskType: AiTaskType) => Promise<RunAiTaskCommand>
}>()

const activeCaseId = computed(() => props.caseId)

const session = ref(getAiSession())
const sendConsent = ref(false)
const message = ref<string | null>(null)
const activeTask = ref<AiTaskType | null>(null)
const latestResult = ref<RunAiTaskResult | null>(null)
const running = ref(props.runner?.isRunning(activeCaseId.value) ?? false)
const progressVisible = ref(running.value)

const taskDefinitions: ReadonlyArray<{ type: AiTaskType; label: string }> = [
  { type: 'classify_evidence', label: '分类材料' },
  { type: 'extract_facts', label: '提取事实候选' },
  { type: 'build_timeline', label: '建立时间线候选' },
  { type: 'draft_statement', label: '生成陈述草稿' },
]

const hasText = computed(() => session.value?.capabilities.text === true)
const hasVision = computed(() => session.value?.capabilities.vision === true)
const hasStructuredOutput = computed(() => session.value?.capabilities.jsonMode === true || session.value?.capabilities.jsonSchema === true)
const quickAllowed = computed(() => hasText.value && hasVision.value && hasStructuredOutput.value)
const progressStatus = computed(() => running.value ? 'running' : latestResult.value?.status ?? 'cancelled')
const currentBatch = computed(() => latestResult.value?.analysis?.completedBatchCount ?? 0)
const totalBatches = computed(() => latestResult.value?.analysis?.batchCount ?? 0)

function taskAllowed(taskType: AiTaskType): boolean {
  if (taskType === 'draft_statement') return hasText.value === true && hasStructuredOutput.value
  return quickAllowed.value
}

function errorText(error: unknown): string {
  if (error instanceof AiApiClientError || error instanceof AiTaskRunnerError) return error.code
  return 'provider_unreachable' satisfies ProviderErrorCode
}

async function runTask(taskType: AiTaskType): Promise<void> {
  message.value = null
  if (!sendConsent.value) {
    message.value = '请先确认本次发送范围。'
    return
  }
  if (props.runner === undefined || props.runner === null || props.taskFactory === undefined) {
    message.value = '任务运行器未连接。'
    return
  }

  activeTask.value = taskType
  running.value = true
  progressVisible.value = true
  beginActivity()
  try {
    latestResult.value = await props.runner.runTask({
      ...(await props.taskFactory(taskType)),
      consentGranted: true,
    })
  } catch (error) {
    message.value = errorText(error)
  } finally {
    running.value = false
    endActivity()
  }
}

async function runQuickAnalysis(): Promise<void> {
  message.value = null
  if (!sendConsent.value) {
    message.value = '请先确认本次发送范围。'
    return
  }
  if (props.runner === undefined || props.runner === null || props.taskFactory === undefined) {
    message.value = '任务运行器未连接。'
    return
  }

  activeTask.value = 'classify_evidence'
  running.value = true
  progressVisible.value = true
  beginActivity()
  try {
    const results = await props.runner.runQuickAnalysis({
      caseId: activeCaseId.value,
      consentGranted: true,
      createTask: props.taskFactory as (taskType: Exclude<AiTaskType, 'draft_statement'>) => Promise<RunAiTaskCommand>,
    })
    latestResult.value = results.at(-1) ?? null
  } catch (error) {
    message.value = errorText(error)
  } finally {
    running.value = false
    endActivity()
  }
}

function cancel(): void {
  props.runner?.cancel(activeCaseId.value)
  running.value = false
}
</script>

<template>
  <main class="ai-assistant">
    <h1>AI 助手</h1>
    <p>AI 只生成候选内容；不会自动确认事实、修改原始文件或生成法律结论。</p>
    <p v-if="session === null">请先完成 AI 设置并测试连接。</p>
    <p>每次发送前都会展示 Provider、模型、原始文件名、派生页面和已确认文字，确认范围后才会发送。</p>
    <p>原始文件不会发送；发送的派生页面可能包含敏感内容。AI 可以停用，手工流程始终可用。</p>

    <label>
      <input v-model="sendConsent" data-testid="send-consent" type="checkbox" />
      我已确认本次发送范围，并知悉 Provider 条款、留存和计费风险
    </label>

    <section aria-labelledby="task-list-title">
      <h2 id="task-list-title">分析任务</h2>
      <ul>
        <li v-for="task in taskDefinitions" :key="task.type">
          <button type="button" :data-task="task.type" :disabled="!taskAllowed(task.type)" @click="runTask(task.type)">
            {{ task.label }}
          </button>
          <span v-if="task.type !== 'draft_statement' && !taskAllowed(task.type)">需要文本、视觉和结构化输出能力</span>
          <span v-if="task.type === 'draft_statement' && !taskAllowed(task.type)">需要文本和结构化输出能力</span>
        </li>
      </ul>
      <button type="button" data-action="quick-analysis" :disabled="!quickAllowed || running" @click="runQuickAnalysis">
        一键分析（分类 → 事实 → 时间线）
      </button>
    </section>

    <p v-if="message" role="alert">{{ message }}</p>
    <AiTaskProgress
      v-if="latestResult !== null || progressVisible"
      :task-type="activeTask ?? 'classify_evidence'"
      :stage="activeTask ?? 'idle'"
      :current-batch="currentBatch"
      :total-batches="totalBatches"
      :status="progressStatus"
      :error-code="latestResult?.status === 'failed' ? latestResult.errorCode : null"
      @cancel="cancel"
    />
  </main>
</template>
