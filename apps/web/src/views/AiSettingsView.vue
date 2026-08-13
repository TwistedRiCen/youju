<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  PROVIDER_PRESETS,
  type AiProtocol,
  type ProviderCapabilities,
  type ProviderPreset,
} from '@youju/ai-core'
import type { UtcTimestamp, UuidV4 } from '@youju/domain'
import {
  createAiApiClient,
  AiApiClientError,
  type AiApiClient,
  type ConnectionTestRequest,
} from '../ai/ai-api-client.js'
import { disableAi, setAiSession } from '../ai/ai-session.js'

const props = defineProps<{
  readonly client?: AiApiClient
  readonly now?: () => string
}>()

const fallbackClient = createAiApiClient()
const providerPreset = ref<ProviderPreset>('openai')
const protocol = ref<AiProtocol>('responses')
const baseUrl = ref('')
const modelName = ref('')
const apiKey = ref('')
const consentMode = ref<'strict' | 'session_convenience'>('strict')
const connectionStatus = ref<'untested' | 'testing' | 'tested' | 'error'>('untested')
const connectionError = ref<string | null>(null)
const capabilities = ref<ProviderCapabilities | null>(null)

const providerOptions: ReadonlyArray<{ value: ProviderPreset; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'aliyun_bailian', label: '阿里云百炼' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: '自定义 HTTPS' },
]

const capabilityOptions: ReadonlyArray<{ key: keyof ProviderCapabilities; label: string; testId: string }> = [
  { key: 'text', label: '文本', testId: 'text' },
  { key: 'vision', label: '视觉', testId: 'vision' },
  { key: 'jsonMode', label: 'JSON 模式', testId: 'json-mode' },
  { key: 'jsonSchema', label: 'JSON Schema', testId: 'json-schema' },
  { key: 'streaming', label: '流式输出', testId: 'streaming' },
]

const protocolLocked = computed(() => true)
const currentClient = computed(() => props.client ?? fallbackClient)

function defaultNow(): string {
  return new Date().toISOString()
}

function resetConnectionState(): void {
  connectionStatus.value = 'untested'
  connectionError.value = null
  capabilities.value = null
}

function changeProvider(): void {
  protocol.value = PROVIDER_PRESETS[providerPreset.value].protocol
  if (providerPreset.value !== 'custom') baseUrl.value = ''
  resetConnectionState()
}

async function testConnection(): Promise<void> {
  connectionStatus.value = 'testing'
  connectionError.value = null
  if (providerPreset.value === 'custom' && !/^https:\/\//i.test(baseUrl.value)) {
    connectionStatus.value = 'error'
    connectionError.value = 'target_not_allowed'
    return
  }
  const request: ConnectionTestRequest = {
    requestId: crypto.randomUUID() as UuidV4,
    providerPreset: providerPreset.value,
    protocol: protocol.value,
    ...(providerPreset.value === 'custom' && baseUrl.value.length > 0 ? { baseUrl: baseUrl.value } : {}),
    modelName: modelName.value,
    apiKey: apiKey.value,
    capabilities: PROVIDER_PRESETS[providerPreset.value].capabilities,
  }

  try {
    const result = await currentClient.value.testConnection(request, new AbortController().signal)
    capabilities.value = result.capabilities
    connectionStatus.value = 'tested'
    setAiSession({
      providerPreset: providerPreset.value,
      protocol: protocol.value,
      baseUrl: providerPreset.value === 'custom' ? baseUrl.value : (PROVIDER_PRESETS[providerPreset.value].endpoint ?? ''),
      modelName: modelName.value,
      apiKey: apiKey.value,
      capabilities: result.capabilities,
      consentMode: consentMode.value,
      connectionTestedAt: (props.now ?? defaultNow)() as UtcTimestamp,
    })
  } catch (error) {
    connectionStatus.value = 'error'
    connectionError.value = error instanceof AiApiClientError ? error.code : 'provider_unreachable'
  }
}

function disable(): void {
  disableAi()
  providerPreset.value = 'openai'
  protocol.value = 'responses'
  baseUrl.value = ''
  modelName.value = ''
  apiKey.value = ''
  consentMode.value = 'strict'
  resetConnectionState()
}

watch([providerPreset, protocol, baseUrl, modelName, apiKey, consentMode], resetConnectionState)
</script>

<template>
  <main class="ai-settings">
    <h1>AI 设置</h1>
    <p>API Key 仅保存在当前页面会话内存中，刷新或关闭页面后会清除。</p>

    <label>
      Provider
      <select v-model="providerPreset" data-testid="provider-preset" @change="changeProvider">
        <option v-for="option in providerOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <label>
      协议
      <select v-model="protocol" data-testid="protocol" :disabled="protocolLocked">
        <option value="responses">Responses</option>
        <option value="chat_completions">Chat Completions</option>
      </select>
    </label>

    <label>
      HTTPS Base URL（仅自定义 Provider）
      <input v-model="baseUrl" data-testid="base-url" type="url" :disabled="providerPreset !== 'custom'" />
    </label>

    <label>
      模型名称
      <input v-model="modelName" data-testid="model-name" autocomplete="off" />
    </label>

    <label>
      API Key
      <input v-model="apiKey" data-testid="api-key" type="password" autocomplete="off" />
    </label>

    <label>
      每次发送确认
      <select v-model="consentMode" data-testid="consent-mode">
        <option value="strict">每次发送前确认</option>
        <option value="session_convenience">会话内沿用相同范围</option>
      </select>
    </label>

    <button type="button" data-testid="connection-test" @click="testConnection">测试连接</button>
    <p data-testid="connection-status">
      <span v-if="connectionStatus === 'tested'">连接已测试</span>
      <span v-else-if="connectionStatus === 'testing'">测试中…</span>
      <span v-else-if="connectionStatus === 'error'">测试失败：{{ connectionError }}</span>
      <span v-else>尚未测试</span>
    </p>

    <section aria-labelledby="capabilities-title">
      <h2 id="capabilities-title">独立能力</h2>
      <ul>
        <li v-for="capability in capabilityOptions" :key="capability.key" :data-capability="capability.testId">
          {{ capability.label }}：{{ capabilities?.[capability.key] ? '支持' : '不支持' }}
        </li>
      </ul>
    </section>

    <p>Provider 可能保留请求或将数据用于服务改进，请在发送前查看 Provider 条款。AI 输出可能错误，正式事实仍需人工确认。</p>
    <p>停用 AI 后仍可使用手工材料、事实、时间线和导出流程。</p>
    <button type="button" data-testid="disable-ai" @click="disable">停用 AI 并清除会话 Key</button>
  </main>
</template>
