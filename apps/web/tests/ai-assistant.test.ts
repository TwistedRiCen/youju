import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { disableAi, setAiSession } from '../src/ai/index.js'
import type { AiTaskRunner, RunAiTaskCommand, RunAiTaskResult } from '../src/ai/ai-task-runner.js'
import type { DerivedMedia } from '../src/ai/derived-media.js'
import type { ProviderCapabilities } from '@youju/ai-core'

const { default: AiAssistantView } = await import('../src/views/AiAssistantView.vue')
const { default: AiSendingPreview } = await import('../src/components/AiSendingPreview.vue')
const { default: AiTaskProgress } = await import('../src/components/AiTaskProgress.vue')

const caseId = '00000000-0000-4000-8000-000000000901'
const capabilities: ProviderCapabilities = {
  text: true,
  vision: true,
  jsonMode: true,
  jsonSchema: true,
  streaming: false,
}

const session = {
  providerPreset: 'openai' as const,
  protocol: 'responses' as const,
  baseUrl: 'https://api.example.test/v1',
  modelName: 'fictional-model',
  apiKey: 'fictional-api-key-sentinel-assistant',
  capabilities,
  consentMode: 'strict' as const,
  connectionTestedAt: '2026-08-13T01:00:00.000Z',
}

const media: DerivedMedia = {
  sourceToken: '00000000-0000-4000-8000-000000000902',
  evidenceId: '00000000-0000-4000-8000-000000000903',
  page: 2,
  mediaType: 'image/webp',
  width: 800,
  height: 600,
  bytes: new Uint8Array([1, 2, 3]),
  sha256: 'a'.repeat(64),
  previewUrl: 'blob:fictional-preview',
}

afterEach(() => {
  disableAi()
})

function completedResult(): RunAiTaskResult {
  return {
    status: 'completed',
    analysis: {
      batchCount: 2,
      completedBatchCount: 2,
    } as never,
    candidates: [],
  }
}

describe('AI assistant and sending preview', () => {
  it('exposes four tasks and one-click excludes statement until consent is checked', async () => {
    setAiSession(session)
    const runner: AiTaskRunner = {
      runTask: vi.fn(async () => completedResult()),
      runQuickAnalysis: vi.fn(async () => [completedResult()]),
      cancel: vi.fn(),
      isRunning: vi.fn(() => false),
    }
    const taskFactory = vi.fn(async (taskType): Promise<RunAiTaskCommand> => ({
      caseId,
      taskType,
      provider: session,
      manifest: {} as never,
      derivedMedia: [],
      consentGranted: true,
    }))
    const wrapper = mount(AiAssistantView, { props: { caseId, runner, taskFactory } })
    expect(wrapper.findAll('[data-task]').map((item) => item.attributes('data-task'))).toEqual([
      'classify_evidence',
      'extract_facts',
      'build_timeline',
      'draft_statement',
    ])
    expect(wrapper.find('[data-action="quick-analysis"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('fictional-api-key-sentinel-assistant')

    await wrapper.get('[data-action="quick-analysis"]').trigger('click')
    expect(runner.runQuickAnalysis).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请先确认本次发送范围')

    await wrapper.get('[data-testid="send-consent"]').setValue(true)
    await wrapper.get('[data-action="quick-analysis"]').trigger('click')
    expect(runner.runQuickAnalysis).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="task-progress"]').text()).toContain('批次 2 / 2')
    expect(wrapper.find('[data-testid="task-progress"]').text()).not.toContain('%')
  })

  it('disables vision tasks when the tested capability is unavailable and exposes cancel/refresh semantics', async () => {
    setAiSession({ ...session, capabilities: { ...capabilities, vision: false } })
    const runner: AiTaskRunner = {
      runTask: vi.fn(),
      runQuickAnalysis: vi.fn(),
      cancel: vi.fn(),
      isRunning: vi.fn(() => true),
    }
    const wrapper = mount(AiAssistantView, { props: { caseId, runner, taskFactory: vi.fn() } })
    expect((wrapper.get('[data-task="classify_evidence"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-task="draft_statement"]').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.get('[data-action="cancel"]').trigger('click')
    expect(runner.cancel).toHaveBeenCalledWith(caseId)
    expect(wrapper.text()).toContain('刷新或关闭页面会中止任务')
    expect(wrapper.text()).not.toContain('后台继续')
  })

  it('shows a bounded sending preview with local names, pages, load estimates and repair disclosure', async () => {
    const wrapper = mount(AiSendingPreview, {
      props: {
        providerPreset: 'openai',
        modelName: 'fictional-model',
        materials: [{ id: media.evidenceId, originalName: 'fictional-original.pdf', pages: [media] }],
        confirmedTextFields: [{ name: '问题描述', value: 'fictional confirmed text' }],
        batchCount: 2,
        possibleRepair: true,
      },
    })
    expect(wrapper.text()).toContain('fictional-original.pdf')
    expect(wrapper.text()).toContain('第 2 页')
    expect(wrapper.text()).toContain('fictional confirmed text')
    expect(wrapper.text()).toContain('Provider：openai')
    expect(wrapper.text()).toContain('模型：fictional-model')
    expect(wrapper.text()).toContain('批次：2')
    expect(wrapper.text()).toContain('可能进行一次结构修复调用')
    expect(wrapper.text()).toContain('费用以 Provider 实际账单为准')
    expect(wrapper.find('img').attributes('src')).toBe(media.previewUrl)
    expect(wrapper.text()).not.toContain('fictional-api-key')
  })

  it('renders honest task progress without a fabricated percentage', () => {
    const wrapper = mount(AiTaskProgress, {
      props: { taskType: 'extract_facts', stage: 'extract_facts', currentBatch: 1, totalBatches: 3, status: 'running' },
    })
    expect(wrapper.text()).toContain('批次 1 / 3')
    expect(wrapper.text()).toContain('刷新或关闭页面会中止任务')
    expect(wrapper.text()).not.toContain('%')
  })
})
