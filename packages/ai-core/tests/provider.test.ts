import {
  PROVIDER_PRESETS,
  ProviderErrorCodeSchema,
  isProviderPreset,
} from '../src/index.js'
import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'

describe('provider presets and capabilities', () => {
  it('declares the approved provider endpoints and protocols', () => {
    expect(PROVIDER_PRESETS.openai).toMatchObject({
      protocol: 'responses',
      endpoint: 'https://api.openai.com/v1/responses',
    })
    expect(PROVIDER_PRESETS.aliyun_bailian.endpoint).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    )
    expect(PROVIDER_PRESETS.deepseek.endpoint).toBe('https://api.deepseek.com/chat/completions')
    expect(PROVIDER_PRESETS.siliconflow.endpoint).toBe(
      'https://api.siliconflow.cn/v1/chat/completions',
    )
    expect(PROVIDER_PRESETS.custom).toMatchObject({
      protocol: 'chat_completions',
      endpoint: null,
    })
  })

  it('keeps capabilities separate from credentials', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      expect(preset.capabilities).toEqual({
        text: expect.any(Boolean),
        vision: expect.any(Boolean),
        jsonMode: expect.any(Boolean),
        jsonSchema: expect.any(Boolean),
        streaming: expect.any(Boolean),
      })
      expect(preset).not.toHaveProperty('apiKey')
      expect(preset).not.toHaveProperty('authorization')
    }
  })

  it('accepts only the approved preset and provider error code values', () => {
    expect(isProviderPreset('openai')).toBe(true)
    expect(isProviderPreset('unknown')).toBe(false)
    for (const code of [
      'provider_auth_failed',
      'provider_model_not_found',
      'provider_rate_limited',
      'provider_quota_exceeded',
      'provider_content_rejected',
      'provider_unreachable',
      'provider_timeout',
      'provider_response_too_large',
      'provider_capability_missing',
      'target_not_allowed',
      'invalid_structured_output',
      'repair_failed',
      'request_cancelled',
      'task_already_running',
    ]) {
      expect(Value.Check(ProviderErrorCodeSchema, code)).toBe(true)
    }
    expect(Value.Check(ProviderErrorCodeSchema, 'secret_api_key')).toBe(false)
  })
})
