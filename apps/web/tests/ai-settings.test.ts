import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { disableAi, getAiSession } from '../src/ai/index.js'
import type { AiApiClient, ConnectionTestRequest } from '../src/ai/ai-api-client.js'

const { default: AiSettingsView } = await import('../src/views/AiSettingsView.vue')

const capabilities = {
  text: true,
  vision: true,
  jsonMode: true,
  jsonSchema: true,
  streaming: false,
}

afterEach(() => {
  disableAi()
})

describe('AI settings view', () => {
  it('offers the five approved providers and locks protocol/base URL by provider', async () => {
    const wrapper = mount(AiSettingsView, { props: { client: { testConnection: vi.fn(), executeTask: vi.fn() } satisfies AiApiClient } })
    expect(wrapper.find('[data-testid="provider-preset"]').findAll('option').map((option) => option.element.value)).toEqual([
      'openai',
      'aliyun_bailian',
      'deepseek',
      'siliconflow',
      'custom',
    ])
    expect((wrapper.get('[data-testid="protocol"]').element as HTMLSelectElement).value).toBe('responses')
    expect((wrapper.get('[data-testid="protocol"]').element as HTMLSelectElement).disabled).toBe(true)
    expect((wrapper.get('[data-testid="base-url"]').element as HTMLInputElement).disabled).toBe(true)

    await wrapper.get('[data-testid="provider-preset"]').setValue('custom')
    expect((wrapper.get('[data-testid="protocol"]').element as HTMLSelectElement).value).toBe('chat_completions')
    expect((wrapper.get('[data-testid="base-url"]').element as HTMLInputElement).disabled).toBe(false)
  })

  it('uses a password field, stores only a tested session, and renders independent capability results', async () => {
    let received: ConnectionTestRequest | undefined
    const client: AiApiClient = {
      testConnection: vi.fn(async (request) => {
        received = request
        return { requestId: request.requestId, capabilities, usage: null, providerRequestIdFingerprint: null }
      }),
      executeTask: vi.fn(),
    }
    const wrapper = mount(AiSettingsView, { props: { client } })
    await wrapper.get('[data-testid="model-name"]').setValue('fictional-model')
    await wrapper.get('[data-testid="api-key"]').setValue('fictional-api-key-sentinel-settings')
    expect(wrapper.text()).not.toContain('fictional-api-key-sentinel-settings')

    await wrapper.get('[data-testid="connection-test"]').trigger('click')
    expect(received?.apiKey).toBe('fictional-api-key-sentinel-settings')
    expect(getAiSession()).toMatchObject({ modelName: 'fictional-model', consentMode: 'strict' })
    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('连接已测试')
    expect(wrapper.find('[data-capability="vision"]').text()).toContain('支持')
    expect(wrapper.find('[data-capability="json-schema"]').text()).toContain('支持')

    await wrapper.get('[data-testid="model-name"]').setValue('fictional-model-changed')
    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('尚未测试')
    await wrapper.get('[data-testid="disable-ai"]').trigger('click')
    expect(getAiSession()).toBeNull()
    expect((wrapper.get('[data-testid="model-name"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[data-testid="api-key"]').element as HTMLInputElement).value).toBe('')
  })
})
