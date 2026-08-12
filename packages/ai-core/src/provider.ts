import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const ProviderPresetSchema = Type.Union([
  Type.Literal('openai'),
  Type.Literal('aliyun_bailian'),
  Type.Literal('deepseek'),
  Type.Literal('siliconflow'),
  Type.Literal('custom'),
])

export const AiProtocolSchema = Type.Union([
  Type.Literal('responses'),
  Type.Literal('chat_completions'),
])

export const ProviderCapabilitiesSchema = Type.Object(
  {
    text: Type.Boolean(),
    vision: Type.Boolean(),
    jsonMode: Type.Boolean(),
    jsonSchema: Type.Boolean(),
    streaming: Type.Boolean(),
  },
  { additionalProperties: false },
)

export const ProviderErrorCodeSchema = Type.Union([
  Type.Literal('provider_auth_failed'),
  Type.Literal('provider_model_not_found'),
  Type.Literal('provider_rate_limited'),
  Type.Literal('provider_quota_exceeded'),
  Type.Literal('provider_content_rejected'),
  Type.Literal('provider_unreachable'),
  Type.Literal('provider_timeout'),
  Type.Literal('provider_response_too_large'),
  Type.Literal('provider_capability_missing'),
  Type.Literal('target_not_allowed'),
  Type.Literal('invalid_structured_output'),
  Type.Literal('repair_failed'),
  Type.Literal('request_cancelled'),
  Type.Literal('task_already_running'),
])

export type ProviderPreset = Static<typeof ProviderPresetSchema>
export type AiProtocol = Static<typeof AiProtocolSchema>
export type ProviderCapabilities = Static<typeof ProviderCapabilitiesSchema>
export type ProviderErrorCode = Static<typeof ProviderErrorCodeSchema>

export interface ProviderPresetDefinition {
  readonly preset: ProviderPreset
  readonly protocol: AiProtocol
  readonly endpoint: string | null
  readonly capabilities: ProviderCapabilities
}

export const PROVIDER_PRESETS: Readonly<Record<ProviderPreset, ProviderPresetDefinition>> = {
  openai: {
    preset: 'openai',
    protocol: 'responses',
    endpoint: 'https://api.openai.com/v1/responses',
    capabilities: {
      text: true,
      vision: true,
      jsonMode: true,
      jsonSchema: true,
      streaming: true,
    },
  },
  aliyun_bailian: {
    preset: 'aliyun_bailian',
    protocol: 'chat_completions',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    capabilities: {
      text: true,
      vision: true,
      jsonMode: true,
      jsonSchema: false,
      streaming: true,
    },
  },
  deepseek: {
    preset: 'deepseek',
    protocol: 'chat_completions',
    endpoint: 'https://api.deepseek.com/chat/completions',
    capabilities: {
      text: true,
      vision: false,
      jsonMode: true,
      jsonSchema: false,
      streaming: true,
    },
  },
  siliconflow: {
    preset: 'siliconflow',
    protocol: 'chat_completions',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    capabilities: {
      text: true,
      vision: false,
      jsonMode: true,
      jsonSchema: false,
      streaming: true,
    },
  },
  custom: {
    preset: 'custom',
    protocol: 'chat_completions',
    endpoint: null,
    capabilities: {
      text: false,
      vision: false,
      jsonMode: false,
      jsonSchema: false,
      streaming: false,
    },
  },
}

export function isProviderPreset(value: unknown): value is ProviderPreset {
  return Value.Check(ProviderPresetSchema, value)
}
